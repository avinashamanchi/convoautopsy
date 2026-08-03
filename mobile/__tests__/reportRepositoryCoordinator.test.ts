import type { AnalysisResult } from '../src/domain/analysis';
import type { ReportRepository, SavedReport } from '../src/services/reportRepository';
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
  const pendingList = deferred<SavedReport[]>();
  const repository: ReportRepository = {
    initialize: async () => {},
    list: async () => pendingList.promise,
    get: async () => null,
    save: async () => {},
    delete: async () => {},
    deleteAll: async () => {},
  };
  const coordinated = createInvalidatingReportRepository(repository);

  const staleRead = coordinated.list();
  await coordinated.deleteAll();
  pendingList.resolve([report]);

  await expect(staleRead).rejects.toBeInstanceOf(RepositoryInvalidatedError);
});

it('serializes delete after an already-started save so retained source cannot reappear', async () => {
  const saveGate = deferred<void>();
  const reports: SavedReport[] = [];
  let saveStarted = false;
  const repository: ReportRepository = {
    initialize: async () => {},
    list: async () => [...reports],
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
  await expect(coordinated.list()).resolves.toEqual([]);
  expect(reports.some((item) => item.sourceText?.includes('retained source'))).toBe(false);
});

it('publishes revisions for successful save, delete, and delete-all transitions', async () => {
  const repository: ReportRepository = {
    initialize: async () => {}, list: async () => [], get: async () => null,
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
