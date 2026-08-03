const mockRequireOptionalNativeModule = jest.fn();

jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: mockRequireOptionalNativeModule }));

const loadOcr = () => {
  let module: typeof import('../src/services/ocr');
  jest.isolateModules(() => {
    module = require('../src/services/ocr') as typeof import('../src/services/ocr');
  });
  return module!;
};

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

it('reports OCR unavailable without crashing when Expo Go lacks the optional module', () => {
  mockRequireOptionalNativeModule.mockReturnValue(null);

  expect(loadOcr().isOcrAvailable()).toBe(false);
});

it('returns recognized text from the installed native module', async () => {
  mockRequireOptionalNativeModule.mockReturnValue({ recognizeText: jest.fn().mockResolvedValue('Alex: Hello') });

  await expect(loadOcr().recognizeConversationText('file:///private/screenshot.png')).resolves.toBe('Alex: Hello');
});

it('surfaces a native recognition rejection as the stable OCR_FAILED code', async () => {
  mockRequireOptionalNativeModule.mockReturnValue({ recognizeText: jest.fn().mockRejectedValue(new Error('native error')) });

  await expect(loadOcr().recognizeConversationText('file:///private/screenshot.png')).rejects.toThrow('OCR_FAILED');
});

it('surfaces an empty native recognition result as OCR_EMPTY', async () => {
  mockRequireOptionalNativeModule.mockReturnValue({ recognizeText: jest.fn().mockResolvedValue('  ') });

  await expect(loadOcr().recognizeConversationText('file:///private/screenshot.png')).rejects.toThrow('OCR_EMPTY');
});
