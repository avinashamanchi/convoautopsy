import { Directory, File, Paths } from 'expo-file-system';
import type { ConsentStore } from './consentStore';
import type { PreferenceStore, ReportRepository } from './reportRepository';

export type DeleteSubsystem = 'reports' | 'preferences' | 'secureStore' | 'cache' | 'session';

export type DeleteAllOutcome =
  | { ok: true }
  | { ok: false; failed: DeleteSubsystem[] };

export type CacheArtifactStore = {
  deleteAllConvoAutopsyArtifacts(): Promise<void>;
};

export type DeleteAllAppDataDependencies = {
  repository: Pick<ReportRepository, 'deleteAll'>;
  preferences: Pick<PreferenceStore, 'deleteAll'>;
  secureStore: Pick<ConsentStore, 'clearInstallationToken'>;
  cache: CacheArtifactStore;
  session: { reset(): void };
};

const APP_CACHE_PREFIXES = ['convoautopsy-response-', 'convoautopsy-report-'] as const;

export const nativeCacheArtifactStore: CacheArtifactStore = {
  async deleteAllConvoAutopsyArtifacts() {
    const cacheDirectory = new Directory(Paths.cache);
    for (const entry of cacheDirectory.list()) {
      if (entry instanceof File && APP_CACHE_PREFIXES.some((prefix) => entry.name.startsWith(prefix))) {
        entry.delete();
      }
    }
  },
};

export async function deleteAllAppData({ repository, preferences, secureStore, cache, session }: DeleteAllAppDataDependencies): Promise<DeleteAllOutcome> {
  const operations: [Exclude<DeleteSubsystem, 'session'>, () => Promise<void>][] = [
    ['reports', () => repository.deleteAll()],
    ['preferences', () => preferences.deleteAll()],
    ['secureStore', () => secureStore.clearInstallationToken()],
    ['cache', () => cache.deleteAllConvoAutopsyArtifacts()],
  ];
  const settled = await Promise.allSettled(operations.map(([, operation]) => operation()));
  const failed: DeleteSubsystem[] = settled.flatMap((result, index) => result.status === 'rejected' ? [operations[index][0]] : []);

  try {
    session.reset();
  } catch {
    failed.push('session');
  }

  return failed.length ? { ok: false, failed } : { ok: true };
}
