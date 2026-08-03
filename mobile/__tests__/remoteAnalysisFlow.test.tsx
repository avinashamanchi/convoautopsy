jest.mock('../src/services/consentStore', () => ({
  CONSENT_VERSION: '2026-08-02',
  SECURE_STORAGE_UNAVAILABLE_MESSAGE: 'Secure device storage is unavailable. On-device analysis still works.',
  createConsentStore: jest.fn(),
}));

jest.mock('../src/services/aiClient', () => ({
  ...jest.requireActual('../src/services/aiClient'),
  createAiClient: jest.fn(),
}));

import { fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { createAiClient } from '../src/services/aiClient';
import { AiClientError } from '../src/services/aiClient';
import { createConsentStore } from '../src/services/consentStore';
import type { AnalysisResult } from '../src/domain/analysis';

const aiResult: AnalysisResult = {
  schemaVersion: 1,
  mode: 'ai',
  intensityScore: 19,
  conflictMode: 'Collaborating',
  messages: [
    { sender: 'Person A', text: 'Can we talk?', pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: 'A possible interpretation.' },
    { sender: 'Person B', text: 'Not now.', pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: 'A possible interpretation.' },
  ],
};

const mockedCreateAiClient = createAiClient as jest.MockedFunction<typeof createAiClient>;
const mockedCreateConsentStore = createConsentStore as jest.MockedFunction<typeof createConsentStore>;
let remoteAnalysis: jest.Mock;
let grantConsent: jest.Mock;
let getConsent: jest.Mock;

async function renderPreview() {
  const rendered = renderRouter('./app', { initialUrl: '/' });
  fireEvent.changeText(await screen.findByLabelText('Conversation text'), 'Alex: Can we talk?\nJordan: Not now.');
  fireEvent.press(screen.getByRole('button', { name: 'Review conversation' }));
  return rendered;
}

beforeEach(() => {
  remoteAnalysis = jest.fn();
  grantConsent = jest.fn().mockResolvedValue({ version: '2026-08-02', grantedAt: '2026-08-02T00:00:00.000Z', provider: 'Groq' });
  getConsent = jest.fn().mockResolvedValue(null);
  mockedCreateAiClient.mockReturnValue(remoteAnalysis);
  mockedCreateConsentStore.mockReturnValue({
    getConsent,
    grantConsent,
    revokeConsent: jest.fn(),
    getInstallationToken: jest.fn(),
    clearRemoteAnalysisData: jest.fn(), clearInstallationToken: jest.fn(),
  });
});

it('shows the first-use disclosure before requesting AI analysis', async () => {
  await renderPreview();
  await screen.findByText('Person A');

  fireEvent.press(screen.getByRole('button', { name: 'Use AI-assisted analysis' }));

  expect(await screen.findByText(/Names are replaced with Person labels/)).toBeOnTheScreen();
  expect(remoteAnalysis).not.toHaveBeenCalled();
});

it('declining the disclosure makes no remote request', async () => {
  await renderPreview();
  await screen.findByText('Person A');
  fireEvent.press(screen.getByRole('button', { name: 'Use AI-assisted analysis' }));
  await screen.findByText(/Names are replaced with Person labels/);

  fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

  expect(remoteAnalysis).not.toHaveBeenCalled();
  expect(screen.queryByText(/Names are replaced with Person labels/)).toBeNull();
});

it('deduplicates agreement presses and labels the successful result as AI-assisted', async () => {
  remoteAnalysis.mockResolvedValue(aiResult);
  await renderPreview();
  await screen.findByText('Person A');
  fireEvent.press(screen.getByRole('button', { name: 'Use AI-assisted analysis' }));
  await screen.findByText(/Names are replaced with Person labels/);

  const agree = screen.getByRole('button', { name: 'Agree and continue' });
  fireEvent.press(agree);
  fireEvent.press(agree);

  expect(await screen.findByText('AI-assisted estimate')).toBeOnTheScreen();
  expect(remoteAnalysis).toHaveBeenCalledTimes(1);
});

it('cancels the active request and ignores a late success', async () => {
  let resolveRemote: ((result: AnalysisResult) => void) | undefined;
  let remoteSignal: AbortSignal | undefined;
  remoteAnalysis.mockImplementation((_messages: unknown, signal: AbortSignal) => new Promise<AnalysisResult>((resolve) => {
    resolveRemote = resolve;
    remoteSignal = signal;
    signal.addEventListener('abort', () => undefined);
  }));
  await renderPreview();
  await screen.findByText('Person A');
  fireEvent.press(screen.getByRole('button', { name: 'Use AI-assisted analysis' }));
  await screen.findByText(/Names are replaced with Person labels/);
  fireEvent.press(screen.getByRole('button', { name: 'Agree and continue' }));

  fireEvent.press(await screen.findByRole('button', { name: 'Cancel AI analysis' }));
  expect(remoteSignal?.aborted).toBe(true);
  resolveRemote?.(aiResult);

  expect(await screen.findByText('Review your conversation')).toBeOnTheScreen();
  expect(screen.queryByText('AI-assisted estimate')).toBeNull();
});

it('does not start remote analysis when cancellation occurs during consent persistence', async () => {
  let resolveGrant: (() => void) | undefined;
  grantConsent.mockImplementation(() => new Promise<void>((resolve) => { resolveGrant = resolve; }));
  await renderPreview();
  await screen.findByText('Person A');
  fireEvent.press(screen.getByRole('button', { name: 'Use AI-assisted analysis' }));
  await screen.findByText(/Names are replaced with Person labels/);
  fireEvent.press(screen.getByRole('button', { name: 'Agree and continue' }));

  fireEvent.press(await screen.findByRole('button', { name: 'Cancel AI analysis' }));
  resolveGrant?.();

  expect(await screen.findByText('Review your conversation')).toBeOnTheScreen();
  expect(remoteAnalysis).not.toHaveBeenCalled();
});

it('aborts remote work when the preview route unmounts', async () => {
  let remoteSignal: AbortSignal | undefined;
  remoteAnalysis.mockImplementation((_messages: unknown, signal: AbortSignal) => new Promise<AnalysisResult>(() => {
    remoteSignal = signal;
  }));
  const rendered = await renderPreview();
  await screen.findByText('Person A');
  fireEvent.press(screen.getByRole('button', { name: 'Use AI-assisted analysis' }));
  await screen.findByText(/Names are replaced with Person labels/);
  fireEvent.press(screen.getByRole('button', { name: 'Agree and continue' }));
  await screen.findByRole('button', { name: 'Cancel AI analysis' });

  rendered.unmount();

  expect(remoteSignal?.aborted).toBe(true);
});

it('does not continue a pending consent lookup after the preview route unmounts', async () => {
  let resolveConsent: ((value: null) => void) | undefined;
  getConsent.mockImplementation(() => new Promise<null>((resolve) => { resolveConsent = resolve; }));
  const rendered = await renderPreview();
  await screen.findByText('Person A');
  fireEvent.press(screen.getByRole('button', { name: 'Use AI-assisted analysis' }));

  rendered.unmount();
  resolveConsent?.(null);
  await Promise.resolve();

  expect(remoteAnalysis).not.toHaveBeenCalled();
});

it('keeps the preview available after consent persistence fails', async () => {
  grantConsent.mockRejectedValue(new Error('storage detail must not be displayed'));
  await renderPreview();
  await screen.findByText('Person A');
  fireEvent.press(screen.getByRole('button', { name: 'Use AI-assisted analysis' }));
  await screen.findByText(/Names are replaced with Person labels/);
  fireEvent.press(screen.getByRole('button', { name: 'Agree and continue' }));

  expect(await screen.findByText("AI-assisted analysis couldn't be completed. Your conversation is still available.")).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Run on-device analysis instead' })).toBeOnTheScreen();
  expect(remoteAnalysis).not.toHaveBeenCalled();
});

it('keeps the draft and offers a manual on-device alternative after an AI failure', async () => {
  remoteAnalysis.mockRejectedValue(new Error('network details must not reach the screen'));
  await renderPreview();
  await screen.findByText('Person A');
  fireEvent.press(screen.getByRole('button', { name: 'Use AI-assisted analysis' }));
  await screen.findByText(/Names are replaced with Person labels/);
  fireEvent.press(screen.getByRole('button', { name: 'Agree and continue' }));

  expect(await screen.findByRole('button', { name: 'Run on-device analysis instead' })).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Run on-device analysis instead' }));

  expect(await screen.findByText('On-device estimate')).toBeOnTheScreen();
});

it.each([
  ['NOT_CONFIGURED', 'AI-assisted analysis is not configured. On-device analysis is available.'],
  ['SERVICE_UNAVAILABLE', 'AI-assisted analysis is temporarily unavailable. Your conversation is still available.'],
] as const)('distinguishes %s from a generic remote failure', async (code, expectedMessage) => {
  remoteAnalysis.mockRejectedValue(new AiClientError(code));
  await renderPreview();
  await screen.findByText('Person A');
  fireEvent.press(screen.getByRole('button', { name: 'Use AI-assisted analysis' }));
  await screen.findByText(/Names are replaced with Person labels/);
  fireEvent.press(screen.getByRole('button', { name: 'Agree and continue' }));

  expect(await screen.findByText(expectedMessage)).toBeOnTheScreen();
});
