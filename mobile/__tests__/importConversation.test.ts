import {
  createImportConversationService,
  type PickerArtifact,
  type PickerArtifactPort,
} from '../src/services/importConversation';

const documentPicker = { getDocumentAsync: jest.fn() };
const imagePicker = { launchImageLibraryAsync: jest.fn() };

function artifact(overrides: Partial<PickerArtifact> = {}): PickerArtifact {
  return {
    uri: 'file:///cache/convoautopsy-artifacts/picker/scoped.txt',
    size: 10,
    text: jest.fn().mockResolvedValue('Alex: Hello\nJordan: Hi'),
    ...overrides,
  };
}

function harness(nextArtifact = artifact()) {
  const artifacts: jest.Mocked<PickerArtifactPort> = {
    stagePickerArtifact: jest.fn().mockResolvedValue(nextArtifact),
    deletePickerArtifact: jest.fn().mockResolvedValue(undefined),
  };
  return {
    artifacts,
    service: createImportConversationService({ documentPicker, imagePicker, artifacts }),
  };
}

const selectedFile = (name: string, size = 10) => ({
  canceled: false as const,
  assets: [{ name, size, uri: 'file:///cache/document-picker-copy' }],
});

beforeEach(() => {
  jest.clearAllMocks();
});

it.each(['conversation.txt', 'conversation.log', 'conversation.csv'])(
  'imports a supported %s document and deletes the scoped picker copy after reading',
  async (name) => {
    documentPicker.getDocumentAsync.mockResolvedValue(selectedFile(name));
    const { artifacts, service } = harness();

    await expect(service.pickConversationFile()).resolves.toEqual({
      ok: true,
      source: 'document',
      text: 'Alex: Hello\nJordan: Hi',
    });
    expect(artifacts.deletePickerArtifact).toHaveBeenCalledWith('file:///cache/convoautopsy-artifacts/picker/scoped.txt');
  },
);

it('deletes the copied document after a read failure and on a later retry', async () => {
  documentPicker.getDocumentAsync
    .mockResolvedValueOnce(selectedFile('conversation.txt'))
    .mockResolvedValueOnce(selectedFile('conversation.txt'));
  const unreadable = artifact({ text: jest.fn().mockRejectedValue(new Error('unreadable')) });
  const readable = artifact({ uri: 'file:///cache/convoautopsy-artifacts/picker/retry.txt' });
  const { artifacts, service } = harness();
  artifacts.stagePickerArtifact
    .mockResolvedValueOnce(unreadable)
    .mockResolvedValueOnce(readable);

  await expect(service.pickConversationFile()).resolves.toEqual({ ok: false, code: 'UNREADABLE_FILE' });
  await expect(service.pickConversationFile()).resolves.toMatchObject({ ok: true, source: 'document' });

  expect(artifacts.deletePickerArtifact).toHaveBeenNthCalledWith(1, unreadable.uri);
  expect(artifacts.deletePickerArtifact).toHaveBeenNthCalledWith(2, readable.uri);
});

it('stages and deletes unsupported and oversized copied documents without reading them', async () => {
  documentPicker.getDocumentAsync
    .mockResolvedValueOnce(selectedFile('conversation.pdf'))
    .mockResolvedValueOnce(selectedFile('conversation.txt', 1_048_577));
  const nextArtifact = artifact({ text: jest.fn() });
  const { artifacts, service } = harness(nextArtifact);

  await expect(service.pickConversationFile()).resolves.toEqual({ ok: false, code: 'UNSUPPORTED_TYPE' });
  await expect(service.pickConversationFile()).resolves.toEqual({ ok: false, code: 'FILE_TOO_LARGE' });

  expect(nextArtifact.text).not.toHaveBeenCalled();
  expect(artifacts.deletePickerArtifact).toHaveBeenCalledTimes(2);
});

it('treats dismissed pickers as cancellation without staging an artifact', async () => {
  documentPicker.getDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
  imagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });
  const { artifacts, service } = harness();

  await expect(service.pickConversationFile()).resolves.toEqual({ ok: false, code: 'CANCELLED' });
  await expect(service.pickConversationScreenshot()).resolves.toEqual({ ok: false, code: 'CANCELLED' });
  expect(artifacts.stagePickerArtifact).not.toHaveBeenCalled();
});

it('uses code points for the 100,000-character document limit', async () => {
  documentPicker.getDocumentAsync
    .mockResolvedValueOnce(selectedFile('conversation.txt', 400_000))
    .mockResolvedValueOnce(selectedFile('conversation.txt', 400_004));
  const exact = artifact({ size: 400_000, text: jest.fn().mockResolvedValue('😀'.repeat(100_000)) });
  const over = artifact({ size: 400_004, text: jest.fn().mockResolvedValue('😀'.repeat(100_001)) });
  const { artifacts, service } = harness();
  artifacts.stagePickerArtifact.mockResolvedValueOnce(exact).mockResolvedValueOnce(over);

  await expect(service.pickConversationFile()).resolves.toMatchObject({ ok: true, source: 'document' });
  await expect(service.pickConversationFile()).resolves.toEqual({ ok: false, code: 'FILE_TOO_LARGE' });
});

it('returns only a scoped screenshot URI and deletes it when the caller finishes OCR', async () => {
  imagePicker.launchImageLibraryAsync.mockResolvedValue({
    canceled: false,
    assets: [{ fileName: 'screenshot.png', uri: 'file:///cache/image-picker-copy.png' }],
  });
  const screenshot = artifact({ uri: 'file:///cache/convoautopsy-artifacts/picker/screenshot.png' });
  const { artifacts, service } = harness(screenshot);

  await expect(service.pickConversationScreenshot()).resolves.toEqual({
    ok: true,
    source: 'screenshot',
    uri: screenshot.uri,
  });
  expect(artifacts.deletePickerArtifact).not.toHaveBeenCalled();

  await service.deletePickerArtifact(screenshot.uri);
  expect(artifacts.deletePickerArtifact).toHaveBeenCalledWith(screenshot.uri);
});
