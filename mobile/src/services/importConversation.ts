import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

const MAX_FILE_BYTES = 1_048_576;
const MAX_CHARACTERS = 100_000;
const SUPPORTED_EXTENSIONS = new Set(['txt', 'log', 'csv']);

export type ImportResult =
  | { ok: true; text: string; source: 'document' }
  | { ok: false; code: 'CANCELLED' | 'UNSUPPORTED_TYPE' | 'EMPTY_FILE' | 'FILE_TOO_LARGE' | 'UNREADABLE_FILE' };

export type ImageImportResult =
  | { ok: true; uri: string; source: 'screenshot' }
  | { ok: false; code: 'CANCELLED' | 'IMAGE_PICKER_FAILED' };

function isSupportedTextFile(name: string): boolean {
  const extension = name.trim().split('.').pop()?.toLowerCase();
  return extension !== undefined && SUPPORTED_EXTENSIONS.has(extension);
}

export async function pickConversationFile(): Promise<ImportResult> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ['text/plain', 'text/csv', 'text/*'],
    });
    if (result.canceled) return { ok: false, code: 'CANCELLED' };

    const asset = result.assets[0];
    if (!asset || !isSupportedTextFile(asset.name)) return { ok: false, code: 'UNSUPPORTED_TYPE' };
    if (typeof asset.size === 'number' && asset.size > MAX_FILE_BYTES) {
      return { ok: false, code: 'FILE_TOO_LARGE' };
    }

    const file = new File(asset.uri);
    if (asset.size === undefined && file.size !== null && file.size > MAX_FILE_BYTES) {
      return { ok: false, code: 'FILE_TOO_LARGE' };
    }

    const text = await file.text();
    if (text.length > MAX_CHARACTERS) return { ok: false, code: 'FILE_TOO_LARGE' };
    if (!text.trim()) return { ok: false, code: 'EMPTY_FILE' };
    return { ok: true, text, source: 'document' };
  } catch {
    return { ok: false, code: 'UNREADABLE_FILE' };
  }
}

export async function pickConversationScreenshot(): Promise<ImageImportResult> {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (result.canceled) return { ok: false, code: 'CANCELLED' };

    const uri = result.assets[0]?.uri;
    return uri
      ? { ok: true, source: 'screenshot', uri }
      : { ok: false, code: 'IMAGE_PICKER_FAILED' };
  } catch {
    return { ok: false, code: 'IMAGE_PICKER_FAILED' };
  }
}
