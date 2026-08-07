import type { ReportRepository, SavedReport } from './reportRepository';
import { canSaveReport, type SaveGate } from '../billing/saveGate';

export type RepositorySnapshot = { revision: number; deletingAll: boolean };

export type InvalidatingReportRepository = ReportRepository & {
  saveIfAllowed(report: SavedReport, pro: boolean): Promise<SaveGate>;
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
    list: (query) => read(() => repository.list(query)),
    get: (id) => read(() => repository.get(id)),
    save: (report: SavedReport) => mutate(() => repository.save(report)),
    saveIfAllowed: (report: SavedReport, pro: boolean) => mutate(async () => {
      const gate = canSaveReport((await repository.list()).length, pro);
      if (!gate.allowed) return gate;
      await repository.save(report);
      return gate;
    }, (gate) => gate.allowed),
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
