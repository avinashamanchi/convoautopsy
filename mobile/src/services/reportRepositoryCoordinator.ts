import type { ReportRepository, SavedReport } from './reportRepository';
import type { ResponseDraft } from '../domain/analysis';
import { canSaveReport, type SaveGate } from '../billing/saveGate';

export type RepositorySnapshot = { revision: number; deletingAll: boolean };

export type InvalidatingReportRepository = ReportRepository & {
  saveIfAllowed(report: SavedReport, pro: boolean): Promise<SaveGate>;
  appendResponseDraft(reportId: string, draft: ResponseDraft): Promise<SavedReport | null>;
  getSnapshot(): RepositorySnapshot;
  subscribe(listener: (snapshot: RepositorySnapshot) => void): () => void;
};

export class RepositoryInvalidatedError extends Error {
  constructor() {
    super('REPORT_REPOSITORY_INVALIDATED');
    this.name = 'RepositoryInvalidatedError';
  }
}

export function createInvalidatingReportRepository(repository: ReportRepository): InvalidatingReportRepository {
  let generation = 0;
  let revision = 0;
  let deletingAll = false;
  let deletion: Promise<void> | null = null;
  let mutationTail = Promise.resolve();
  const listeners = new Set<(snapshot: RepositorySnapshot) => void>();

  const snapshot = (): RepositorySnapshot => ({ revision, deletingAll });
  const publish = () => {
    revision += 1;
    const next = snapshot();
    for (const listener of listeners) listener(next);
  };
  const assertCurrent = (capturedGeneration: number) => {
    if (capturedGeneration !== generation || deletingAll) throw new RepositoryInvalidatedError();
  };

  async function read<T>(operation: () => Promise<T>): Promise<T> {
    const capturedGeneration = generation;
    assertCurrent(capturedGeneration);
    const value = await operation();
    assertCurrent(capturedGeneration);
    return value;
  }

  function mutate<T>(operation: () => Promise<T>, shouldPublish: (value: T) => boolean = () => true): Promise<T> {
    const capturedGeneration = generation;
    if (deletingAll) return Promise.reject(new RepositoryInvalidatedError());
    const pending = mutationTail.then(async () => {
      assertCurrent(capturedGeneration);
      const value = await operation();
      assertCurrent(capturedGeneration);
      if (shouldPublish(value)) publish();
      return value;
    });
    mutationTail = pending.then(() => undefined, () => undefined);
    return pending;
  }

  return {
    initialize: () => repository.initialize(),
    listPage: (request) => read(() => repository.listPage(request)),
    count: () => read(() => repository.count()),
    getTrendSummary: (fromInclusive, toExclusive) => read(() => repository.getTrendSummary(fromInclusive, toExclusive)),
    get: (id) => read(() => repository.get(id)),
    save: (report: SavedReport) => mutate(() => repository.save(report)),
    saveIfAllowed: (report: SavedReport, pro: boolean) => mutate(async () => {
      const gate = pro ? canSaveReport(0, true) : canSaveReport(await repository.count(), false);
      if (!gate.allowed) return gate;
      await repository.save(report);
      return gate;
    }, (gate) => gate.allowed),
    appendResponseDraft: (reportId: string, draft: ResponseDraft) => mutate(async () => {
      const latest = await repository.get(reportId);
      if (!latest) return { changed: false, report: null };
      const alreadyStored = latest.responseDrafts.some((item) => (
        item.id === draft.id && item.text === draft.text && item.hint === draft.hint
      ));
      if (alreadyStored) return { changed: false, report: latest };

      const storedDraft = withUniqueDraftId(draft, latest.responseDrafts);
      const updated: SavedReport = {
        ...latest,
        responseDrafts: [...latest.responseDrafts.map((item) => ({ ...item })), storedDraft],
        updatedAt: new Date().toISOString(),
      };
      await repository.save(updated);
      return { changed: true, report: updated };
    }, ({ changed }) => changed).then(({ report: updated }) => updated),
    delete: (id) => mutate(() => repository.delete(id)),
    deleteAll() {
      if (deletion) return deletion;
      generation += 1;
      deletingAll = true;
      publish();
      const pending = mutationTail.then(() => repository.deleteAll());
      mutationTail = pending.then(() => undefined, () => undefined);
      deletion = pending.then(
        () => {
          deletingAll = false;
          deletion = null;
          publish();
        },
        (error: unknown) => {
          deletingAll = false;
          deletion = null;
          publish();
          throw error;
        },
      );
      return deletion;
    },
    getSnapshot: snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function withUniqueDraftId(draft: ResponseDraft, existing: readonly ResponseDraft[]): ResponseDraft {
  const existingIds = new Set(existing.map(({ id }) => id));
  if (!existingIds.has(draft.id)) return { ...draft };
  let suffix = 2;
  let id = draft.id;
  while (existingIds.has(id)) {
    const marker = `-${suffix}`;
    id = `${draft.id.slice(0, 100 - marker.length)}${marker}`;
    suffix += 1;
  }
  return { ...draft, id };
}
