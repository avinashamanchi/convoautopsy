import { deleteAllAppData } from '../src/services/deleteAllAppData';
import { createScopedCacheArtifactStore } from '../src/services/cacheArtifacts';

describe('deleteAllAppData', () => {
  it('removes every ConvoAutopsy data subsystem before resetting the in-memory session', async () => {
    const calls: string[] = [];

    const outcome = await deleteAllAppData({
      repository: { deleteAll: async () => { calls.push('reports'); } },
      preferences: { deleteAll: async () => { calls.push('preferences'); } },
      secureStore: { clearInstallationToken: async () => { calls.push('secureStore'); } },
      cache: { deleteAllConvoAutopsyArtifacts: async () => { calls.push('cache'); } },
      session: { reset: () => { calls.push('session'); } },
    });

    expect(outcome).toEqual({ ok: true });
    expect(calls).toEqual(['reports', 'preferences', 'secureStore', 'cache', 'session']);
  });

  it('returns every failed subsystem and does not report a partial deletion as successful', async () => {
    const calls: string[] = [];

    const outcome = await deleteAllAppData({
      repository: { deleteAll: async () => { calls.push('reports'); throw new Error('locked'); } },
      preferences: { deleteAll: async () => { calls.push('preferences'); } },
      secureStore: { clearInstallationToken: async () => { calls.push('secureStore'); throw new Error('unavailable'); } },
      cache: { deleteAllConvoAutopsyArtifacts: async () => { calls.push('cache'); throw new Error('read-only'); } },
      session: { reset: () => { calls.push('session'); } },
    });

    expect(outcome).toEqual({ ok: false, failed: ['reports', 'secureStore', 'cache'] });
    expect(calls).toEqual(['reports', 'preferences', 'secureStore', 'cache', 'session']);
  });

  it('labels a preference failure independently while still attempting token deletion', async () => {
    const calls: string[] = [];
    const outcome = await deleteAllAppData({
      repository: { deleteAll: async () => {} },
      preferences: { deleteAll: async () => { calls.push('preferences'); throw new Error('locked'); } },
      secureStore: { clearInstallationToken: async () => { calls.push('secureStore'); } },
      cache: { deleteAllConvoAutopsyArtifacts: async () => {} }, session: { reset: () => {} },
    });
    expect(outcome).toEqual({ ok: false, failed: ['preferences'] });
    expect(calls).toEqual(['preferences', 'secureStore']);
  });
});

describe('scoped cache deletion', () => {
  it('recursively deletes only the dedicated ConvoAutopsy artifact directory', async () => {
    const deleteDirectory = jest.fn().mockResolvedValue(undefined);
    const store = createScopedCacheArtifactStore({ deleteDirectory });

    await store.deleteAllConvoAutopsyArtifacts();

    expect(deleteDirectory).toHaveBeenCalledTimes(1);
    expect(deleteDirectory).toHaveBeenCalledWith('convoautopsy-artifacts');
  });

  it('retries the same scoped directory after a cleanup failure', async () => {
    const deleteDirectory = jest.fn()
      .mockRejectedValueOnce(new Error('busy'))
      .mockResolvedValueOnce(undefined);
    const store = createScopedCacheArtifactStore({ deleteDirectory });

    await expect(store.deleteAllConvoAutopsyArtifacts()).rejects.toThrow('busy');
    await expect(store.deleteAllConvoAutopsyArtifacts()).resolves.toBeUndefined();

    expect(deleteDirectory).toHaveBeenCalledTimes(2);
    expect(deleteDirectory).toHaveBeenNthCalledWith(2, 'convoautopsy-artifacts');
  });
});
