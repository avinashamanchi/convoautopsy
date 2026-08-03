import { deleteAllAppData } from '../src/services/deleteAllAppData';

describe('deleteAllAppData', () => {
  it('removes every ConvoAutopsy data subsystem before resetting the in-memory session', async () => {
    const calls: string[] = [];

    const outcome = await deleteAllAppData({
      repository: { deleteAll: async () => { calls.push('reports'); } },
      preferences: { deleteAll: async () => { calls.push('preferences'); } },
      consent: { clearRemoteAnalysisData: async () => { calls.push('secureStore'); } },
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
      consent: { clearRemoteAnalysisData: async () => { calls.push('secureStore'); throw new Error('unavailable'); } },
      cache: { deleteAllConvoAutopsyArtifacts: async () => { calls.push('cache'); throw new Error('read-only'); } },
      session: { reset: () => { calls.push('session'); } },
    });

    expect(outcome).toEqual({ ok: false, failed: ['reports', 'secureStore', 'cache'] });
    expect(calls).toEqual(['reports', 'preferences', 'secureStore', 'cache', 'session']);
  });
});
