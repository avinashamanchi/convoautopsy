import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { codePointCount, MAX_INPUT_CODE_POINTS } from '../domain/textLimits';
import {
  nativePickerArtifactPort,
  type PickerArtifact,
  type PickerArtifactPort,
} from './cacheArtifacts';

const MAX_FILE_BYTES = 1_048_576;
const SUPPORTED_EXTENSIONS = new Set(['txt', 'log', 'csv']);

export type { PickerArtifact, PickerArtifactPort } from './cacheArtifacts';

export type ImportResult =
  | { ok: true; text: string; source: 'document' }
  | { ok: false; code: 'CANCELLED' | 'UNSUPPORTED_TYPE' | 'EMPTY_FILE' | 'FILE_TOO_LARGE' | 'UNREADABLE_FILE' };

export type ImageImportResult =
  | { ok: true; uri: string; source: 'screenshot' }
  | { ok: false; code: 'CANCELLED' | 'IMAGE_PICKER_FAILED' };

type DocumentPickerPort = Pick<typeof DocumentPicker, 'getDocumentAsync'>;
type ImagePickerPort = Pick<typeof ImagePicker, 'launchImageLibraryAsync'>;

type ImportConversationDependencies = {
  documentPicker: DocumentPickerPort;
  imagePicker: ImagePickerPort;
  artifacts: PickerArtifactPort;
};

function isSupportedTextFile(name: string): boolean {
  const extension = name.trim().split('.').pop()?.toLowerCase();
  return extension !== undefined && SUPPORTED_EXTENSIONS.has(extension);
}

export function createImportConversationService({ documentPicker, imagePicker, artifacts }: ImportConversationDependencies) {
  return {
    async pickConversationFile(): Promise<ImportResult> {
      let staged: PickerArtifact | null = null;
      let outcome: ImportResult;
      try {
        const result = await documentPicker.getDocumentAsync({
          copyToCacheDirectory: true,
          multiple: false,
          type: ['text/plain', 'text/csv', 'text/*'],
        });
        if (result.canceled) return { ok: false, code: 'CANCELLED' };

        const asset = result.assets[0];
        if (!asset) return { ok: false, code: 'UNREADABLE_FILE' };
        staged = await artifacts.stagePickerArtifact(asset.uri, asset.name);
        if (!isSupportedTextFile(asset.name)) outcome = { ok: false, code: 'UNSUPPORTED_TYPE' };
        else if (
          typeof staged.size !== 'number'
          || !Number.isFinite(staged.size)
          || staged.size < 0
        ) outcome = { ok: false, code: 'UNREADABLE_FILE' };
        else if (staged.size > MAX_FILE_BYTES || (typeof asset.size === 'number' && asset.size > MAX_FILE_BYTES)) {
          outcome = { ok: false, code: 'FILE_TOO_LARGE' };
        } else {
          const text = await staged.text();
          if (codePointCount(text) > MAX_INPUT_CODE_POINTS) outcome = { ok: false, code: 'FILE_TOO_LARGE' };
          else if (!text.trim()) outcome = { ok: false, code: 'EMPTY_FILE' };
          else outcome = { ok: true, text, source: 'document' };
        }
      } catch {
        outcome = { ok: false, code: 'UNREADABLE_FILE' };
      }

      if (staged) {
        try {
          await artifacts.deletePickerArtifact(staged.uri);
        } catch {
          return { ok: false, code: 'UNREADABLE_FILE' };
        }
      }
      return outcome;
    },

    async pickConversationScreenshot(): Promise<ImageImportResult> {
      try {
        const result = await imagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
        if (result.canceled) return { ok: false, code: 'CANCELLED' };
        const asset = result.assets[0];
        if (!asset?.uri) return { ok: false, code: 'IMAGE_PICKER_FAILED' };
        const staged = await artifacts.stagePickerArtifact(asset.uri, asset.fileName ?? 'screenshot.png');
        return { ok: true, source: 'screenshot', uri: staged.uri };
      } catch {
        return { ok: false, code: 'IMAGE_PICKER_FAILED' };
      }
    },

    async deletePickerArtifact(uri: string): Promise<void> {
      await artifacts.deletePickerArtifact(uri);
    },
  };
}

export const nativeImportConversationService = createImportConversationService({
  artifacts: nativePickerArtifactPort,
  documentPicker: DocumentPicker,
  imagePicker: ImagePicker,
});

export const pickConversationFile = nativeImportConversationService.pickConversationFile;
export const pickConversationScreenshot = nativeImportConversationService.pickConversationScreenshot;
export const deletePickerArtifact = nativeImportConversationService.deletePickerArtifact;
