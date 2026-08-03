import { Directory, File, Paths } from 'expo-file-system';
import { createNativeUuid, type UuidProvider } from './uuid';

export const SCOPED_CACHE_DIRECTORY = 'convoautopsy-artifacts';
const PICKER_DIRECTORY = 'picker';
const EXPORT_DIRECTORY = 'exports';

export type PickerArtifact = {
  uri: string;
  size: number | null;
  text(): Promise<string>;
};

export type PickerArtifactPort = {
  stagePickerArtifact(sourceUri: string, suggestedName: string): Promise<PickerArtifact>;
  deletePickerArtifact(uri: string): Promise<void>;
};

type ScopedCacheDeletionPort = {
  deleteDirectory(name: typeof SCOPED_CACHE_DIRECTORY): Promise<void>;
};

export function createScopedCacheArtifactStore(port: ScopedCacheDeletionPort) {
  return {
    async deleteAllConvoAutopsyArtifacts() {
      await port.deleteDirectory(SCOPED_CACHE_DIRECTORY);
    },
  };
}

const nativeDeletionPort: ScopedCacheDeletionPort = {
  async deleteDirectory(name) {
    const directory = new Directory(Paths.cache, name);
    if (directory.exists) directory.delete();
  },
};

export const nativeCacheArtifactStore = createScopedCacheArtifactStore(nativeDeletionPort);

export function createNativePickerArtifactPort(createId: UuidProvider = createNativeUuid): PickerArtifactPort {
  return {
    async stagePickerArtifact(sourceUri, suggestedName) {
      const directory = scopedDirectory(PICKER_DIRECTORY);
      const source = new File(sourceUri);
      const target = new File(directory, `picker-${createId()}.${safeExtension(suggestedName)}`);
      try {
        if (isWithinDirectory(source.uri, new Directory(Paths.cache).uri)) source.move(target);
        else source.copy(target);
        return {
          uri: target.uri,
          get size() { return target.size; },
          text: () => target.text(),
        };
      } catch (error) {
        deleteIfOwned(source);
        deleteIfOwned(target);
        throw error;
      }
    },
    async deletePickerArtifact(uri) {
      const pickerRoot = scopedDirectory(PICKER_DIRECTORY);
      if (!isWithinDirectory(uri, pickerRoot.uri)) return;
      const file = new File(uri);
      if (file.exists) file.delete();
    },
  };
}

export const nativePickerArtifactPort = createNativePickerArtifactPort();

export function createScopedExportTextFile(text: string, createId: UuidProvider = createNativeUuid): string {
  const directory = scopedDirectory(EXPORT_DIRECTORY);
  const file = new File(directory, `response-${createId()}.txt`);
  file.create({ intermediates: true, overwrite: false });
  file.write(text);
  return file.uri;
}

export async function deleteScopedExportArtifact(uri: string): Promise<void> {
  const exportRoot = scopedDirectory(EXPORT_DIRECTORY);
  if (!isWithinDirectory(uri, exportRoot.uri)) return;
  const file = new File(uri);
  if (file.exists) file.delete();
}

function scopedDirectory(kind: typeof PICKER_DIRECTORY | typeof EXPORT_DIRECTORY): Directory {
  const directory = new Directory(Paths.cache, SCOPED_CACHE_DIRECTORY, kind);
  if (!directory.exists) directory.create({ idempotent: true, intermediates: true });
  return directory;
}

function safeExtension(name: string): string {
  const candidate = name.split('.').pop()?.toLowerCase();
  return candidate && /^[a-z0-9]{1,8}$/.test(candidate) ? candidate : 'bin';
}

function isWithinDirectory(uri: string, directoryUri: string): boolean {
  const root = directoryUri.endsWith('/') ? directoryUri : `${directoryUri}/`;
  return uri.startsWith(root);
}

function deleteIfOwned(file: File): void {
  try {
    if (isWithinDirectory(file.uri, new Directory(Paths.cache).uri) && file.exists) file.delete();
  } catch {
    // A failed staging operation is surfaced; Delete All can retry the scoped directory.
  }
}
