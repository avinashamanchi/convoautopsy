jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images' },
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-file-system', () => ({
  File: jest.fn(),
  __text: jest.fn(),
}));

import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { pickConversationFile, pickConversationScreenshot } from '../src/services/importConversation';

const mockGetDocumentAsync = DocumentPicker.getDocumentAsync as jest.Mock;
const mockLaunchImageLibraryAsync = ImagePicker.launchImageLibraryAsync as jest.Mock;
const mockFile = File as unknown as jest.Mock;
const mockFileText = (jest.requireMock('expo-file-system') as { __text: jest.Mock }).__text;

const selectedFile = (name: string, size = 10) => ({
  canceled: false as const,
  assets: [{ name, size, uri: 'file:///private/input' }],
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFile.mockImplementation(() => ({ text: mockFileText }));
});

it.each(['conversation.txt', 'conversation.log', 'conversation.csv'])(
  'imports a supported %s document into editable text',
  async (name) => {
    mockGetDocumentAsync.mockResolvedValue(selectedFile(name));
    mockFileText.mockResolvedValue('Alex: Hello\nJordan: Hi');

    await expect(pickConversationFile()).resolves.toEqual({
      ok: true,
      source: 'document',
      text: 'Alex: Hello\nJordan: Hi',
    });
  },
);

it('treats a dismissed document picker as a non-error cancellation', async () => {
  mockGetDocumentAsync.mockResolvedValue({ canceled: true, assets: null });

  await expect(pickConversationFile()).resolves.toEqual({ ok: false, code: 'CANCELLED' });
});

it('rejects a document whose extension is not text based', async () => {
  mockGetDocumentAsync.mockResolvedValue(selectedFile('conversation.pdf'));

  await expect(pickConversationFile()).resolves.toEqual({ ok: false, code: 'UNSUPPORTED_TYPE' });
  expect(mockFile).not.toHaveBeenCalled();
});

it('rejects an empty document', async () => {
  mockGetDocumentAsync.mockResolvedValue(selectedFile('conversation.txt'));
  mockFileText.mockResolvedValue('   ');

  await expect(pickConversationFile()).resolves.toEqual({ ok: false, code: 'EMPTY_FILE' });
});

it('returns a stable unreadable code when the selected file cannot be read', async () => {
  mockGetDocumentAsync.mockResolvedValue(selectedFile('conversation.txt'));
  mockFileText.mockRejectedValue(new Error('permission denied'));

  await expect(pickConversationFile()).resolves.toEqual({ ok: false, code: 'UNREADABLE_FILE' });
});

it('rejects a document larger than one MiB before reading it', async () => {
  mockGetDocumentAsync.mockResolvedValue(selectedFile('conversation.txt', 1_048_577));

  await expect(pickConversationFile()).resolves.toEqual({ ok: false, code: 'FILE_TOO_LARGE' });
  expect(mockFile).not.toHaveBeenCalled();
});

it('rejects text beyond the authoritative 100,000 character input limit', async () => {
  mockGetDocumentAsync.mockResolvedValue(selectedFile('conversation.txt'));
  mockFileText.mockResolvedValue('x'.repeat(100_001));

  await expect(pickConversationFile()).resolves.toEqual({ ok: false, code: 'FILE_TOO_LARGE' });
});

it('keeps a selected screenshot URI in the image result only', async () => {
  mockLaunchImageLibraryAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///private/screenshot.png' }],
  });

  await expect(pickConversationScreenshot()).resolves.toEqual({
    ok: true,
    source: 'screenshot',
    uri: 'file:///private/screenshot.png',
  });
});

it('treats a dismissed screenshot picker as a non-error cancellation', async () => {
  mockLaunchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });

  await expect(pickConversationScreenshot()).resolves.toEqual({ ok: false, code: 'CANCELLED' });
});
