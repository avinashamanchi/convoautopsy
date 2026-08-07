import type { AnalysisResult } from '../src/domain/analysis';
import type { ReportPage, ReportRepository, SavedReport } from '../src/services/reportRepository';
import {
  RepositoryInvalidatedError,
  createInvalidatingReportRepository,
} from '../src/services/reportRepositoryCoordinator';

const result: AnalysisResult = {
  schemaVersion: 1,
  mode: 'local',
  intensityScore: 10,
  conflictMode: 'Collaborating',
  messages: [{
    sender: 'Person A', text: 'Hello', pattern: 'Neutral', egoState: 'Adult',
    possibleInterpretation: 'This may be a neutral attempt to communicate.',
  }],
};

const report: SavedReport = {
  id: 'report-1', title: 'Private report', createdAt: '2026-08-02T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z', sourceText: 'Alex: retained source', result, responseDrafts: [],
};

const emptyTrends = async () => ({ reportCount: 0, averageIntensity: null, conflictModes: {}, patterns: {} });
const page = (reports: readonly SavedReport[]): ReportPage => ({
  items: reports.map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt })),
  nextCursor: null,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

it('rejects an in-flight read completed after the delete boundary', async () => {
  const pendingList = deferred<ReportPage>();
  const repository: ReportRepository = {
    initialize: async () => {},
    listPage: async () => pendingList.promise,
    count: async () => 0,
    getTrendSummary: emptyTrends,
    get: async () => null,
    save: async () => {},
    delete: async () => {},
    deleteAll: async () => {},
  };
  const coordinated = createInvalidatingReportRepository(repository);

  const staleRead = coordinated.listPage();
  await coordinated.deleteAll();
  pendingList.resolve(page([report]));

  await expect(staleRead).rejects.toBeInstanceOf(RepositoryInvalidatedError);
});

it('serializes delete after an already-started save so retained source cannot reappear', async () => {
  const saveGate = deferred<void>();
  const reports: SavedReport[] = [];
  let saveStarted = false;
  const repository: ReportRepository = {
    initialize: async () => {},
    listPage: async () => page(reports),
    count: async () => reports.length,
    getTrendSummary: emptyTrends,
    get: async (id) => reports.find((item) => item.id === id) ?? null,
    async save(next) {
      saveStarted = true;
      await saveGate.promise;
      reports.push(next);
    },
    delete: async () => {},
    async deleteAll() { reports.splice(0, reports.length); },
  };
  const coordinated = createInvalidatingReportRepository(repository);

  const staleSave = coordinated.save(report);
  await Promise.resolve();
  expect(saveStarted).toBe(true);
  const deletion = coordinated.deleteAll();
  saveGate.resolve();

  await expect(staleSave).rejects.toBeInstanceOf(RepositoryInvalidatedError);
  await deletion;
  await expect(coordinated.listPage()).resolves.toEqual(page([]));
  expect(reports.some((item) => item.sourceText?.includes('retained source'))).toBe(false);
});

it('publishes revisions for successful save, delete, and delete-all transitions', async () => {
  const repository: ReportRepository = {
    initialize: async () => {}, listPage: async () => page([]), count: async () => 0, getTrendSummary: emptyTrends, get: async () => null,
    save: async () => {}, delete: async () => {}, deleteAll: async () => {},
  };
  const coordinated = createInvalidatingReportRepository(repository);
  const snapshots: Array<{ revision: number; deletingAll: boolean }> = [];
  coordinated.subscribe((snapshot) => snapshots.push(snapshot));

  await coordinated.save(report);
  await coordinated.delete(report.id);
  await coordinated.deleteAll();

  expect(snapshots).toEqual([
    { revision: 1, deletingAll: false },
    { revision: 2, deletingAll: false },
    { revision: 3, deletingAll: true },
    { revision: 4, deletingAll: false },
  ]);
});

it('accepts only one concurrent free save at the ten-report boundary without deleting existing reports', async () => {
  const reports = Array.from({ length: 9 }, (_, index) => ({ ...report, id: `existing-${index}` }));
  const repository: ReportRepository = {
    initialize: async () => {},
    listPage: async () => { throw new Error('save gate must not enumerate reports'); },
    count: async () => reports.length,
    getTrendSummary: emptyTrends,
    get: async (id) => reports.find((item) => item.id === id) ?? null,
    async save(next) { reports.push(next); },
    async delete() {},
    async deleteAll() { reports.splice(0, reports.length); },
  };
  const coordinated = createInvalidatingReportRepository(repository);

  const [first, second] = await Promise.all([
    coordinated.saveIfAllowed({ ...report, id: 'candidate-1' }, false),
    coordinated.saveIfAllowed({ ...report, id: 'candidate-2' }, false),
  ]);

  expect([first, second]).toEqual([
    { allowed: true },
    { allowed: false, reason: 'FREE_HISTORY_LIMIT' },
  ]);
  expect(reports).toHaveLength(10);
  expect(reports.filter((item) => item.id.startsWith('existing-'))).toHaveLength(9);
});

it('does not limit Pro saves', async () => {
  const reports = Array.from({ length: 10 }, (_, index) => ({ ...report, id: `existing-${index}` }));
  const repository: ReportRepository = {
    initialize: async () => {}, listPage: async () => page(reports), count: async () => { throw new Error('Pro save must not count history'); }, getTrendSummary: emptyTrends, get: async () => null,
    async save(next) { reports.push(next); }, delete: async () => {}, deleteAll: async () => {},
  };

  await expect(createInvalidatingReportRepository(repository).saveIfAllowed({ ...report, id: 'pro-report' }, true)).resolves.toEqual({ allowed: true });
  expect(reports).toHaveLength(11);
});
