import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import HomeScreen from '../app/(tabs)/index';
import { AnalysisSessionProvider } from '../src/state/AnalysisSession';

const screenshotUri = 'file:///cache/convoautopsy-artifacts/picker/screenshot.png';

function renderHome(recognizeText: () => Promise<string>, available = true) {
  const imports = {
    pickConversationFile: jest.fn(),
    pickConversationScreenshot: jest.fn().mockResolvedValue({ ok: true as const, source: 'screenshot' as const, uri: screenshotUri }),
    deletePickerArtifact: jest.fn().mockResolvedValue(undefined),
  };
  render(
    <AnalysisSessionProvider>
      <HomeScreen imports={imports} ocr={{ isAvailable: () => available, recognizeText }} />
    </AnalysisSessionProvider>,
  );
  return imports;
}

it.each([
  ['successful OCR', jest.fn().mockResolvedValue('Alex: Hello'), true],
  ['failed OCR', jest.fn().mockRejectedValue(new Error('OCR_FAILED')), true],
  ['Expo Go fallback', jest.fn(), false],
] as const)('deletes the scoped screenshot in finally after %s', async (_label, recognizeText, available) => {
  const imports = renderHome(recognizeText, available);

  fireEvent.press(screen.getByRole('button', { name: 'Import conversation screenshot' }));

  await waitFor(() => expect(imports.deletePickerArtifact).toHaveBeenCalledWith(screenshotUri));
});
