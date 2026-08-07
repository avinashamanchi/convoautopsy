jest.mock('../src/services/consentStore', () => ({
  CONSENT_VERSION: '2026-08-07',
  SECURE_STORAGE_UNAVAILABLE_MESSAGE: 'Secure device storage is unavailable. On-device analysis still works.',
  createConsentStore: jest.fn(),
}));

jest.mock('../src/services/aiClient', () => ({
  ...jest.requireActual('../src/services/aiClient'),
  createAiClient: jest.fn(),
}));

import { fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { AiClientError, createAiClient } from '../src/services/aiClient';
import { createConsentStore } from '../src/services/consentStore';
import type { AnalysisResult } from '../src/domain/analysis';

const aiResult: AnalysisResult = {
  schemaVersion: 1,
  mode: 'ai',
  intensityScore: 19,
  conflictMode: 'Collaborating',
  messages: [
    { sender: 'Person A', text: 'Email me at [EMAIL]', pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: 'A possible interpretation.' },
    { sender: 'Person B', text: 'Call [PHONE]', pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: 'A possible interpretation.' },
  ],
};

const currentConsent = { version: '2026-08-07' as const, grantedAt: '2026-08-07T00:00:00.000Z', provider: 'Groq' as const };
const mockedCreateAiClient = createAiClient as jest.MockedFunction<typeof createAiClient>;
const mockedCreateConsentStore = createConsentStore as jest.MockedFunction<typeof createConsentStore>;
let remoteAnalysis: jest.Mock;
let grantConsent: jest.Mock;
let getConsent: jest.Mock;

async function renderPreview() {
  const rendered = renderRouter('./app', { initialUrl: '/' });
  fireEvent.changeText(
    await screen.findByLabelText('Conversation text'),
    'Alex: Email me at sam@example.com\nJordan: Call +1 415 555 0101',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Review conversation' }));
  await screen.findByText('Person A');
  return rendered;
}

async function openOutgoingReview() {
  fireEvent.press(screen.getByRole('button', { name: 'Use AI-assisted analysis' }));
  await screen.findByText('Automatic detection can miss identifying details. Review the exact text below.');
}

function confirmOutgoingReview() {
  fireEvent.press(screen.getByRole('button', { name: 'Confirm exact text' }));
}

async function openFirstConsent() {
  await openOutgoingReview();
  confirmOutgoingReview();
  await screen.findByText(/Message text is sent to Groq/);
}

beforeEach(() => {
  remoteAnalysis = jest.fn();
  grantConsent = jest.fn().mockResolvedValue(currentConsent);
  getConsent = jest.fn().mockResolvedValue(null);
  mockedCreateAiClient.mockReturnValue(remoteAnalysis);
  mockedCreateConsentStore.mockReturnValue({
    getConsent,
    grantConsent,
    revokeConsent: jest.fn(),
    getInstallationToken: jest.fn(),
    clearRemoteAnalysisData: jest.fn(),
    clearInstallationToken: jest.fn(),
  });
});

it('always opens the exact outgoing-data review before checking even existing consent', async () => {
  getConsent.mockResolvedValue(currentConsent);
  await renderPreview();

  await openOutgoingReview();

  expect(screen.getByLabelText(
    'Text sent for Person A message 1: Email me at [EMAIL]',
  )).toBeOnTheScreen();
  expect(getConsent).not.toHaveBeenCalled();
  expect(remoteAnalysis).not.toHaveBeenCalled();
});

it('shows first-use consent only after exact outgoing text is confirmed', async () => {
  await renderPreview();

  await openOutgoingReview();
  expect(screen.queryByText(/Message text is sent to Groq/)).toBeNull();
  confirmOutgoingReview();

  expect(await screen.findByText(/Message text is sent to Groq/)).toBeOnTheScreen();
  expect(grantConsent).not.toHaveBeenCalled();
  expect(remoteAnalysis).not.toHaveBeenCalled();
});

it('sends exactly the confirmed reviewed texts when consent already exists', async () => {
  getConsent.mockResolvedValue(currentConsent);
  remoteAnalysis.mockResolvedValue(aiResult);
  await renderPreview();
  await openOutgoingReview();

  fireEvent.changeText(
    screen.getByLabelText('Outgoing text for Person B message 2'),
    'Reach me at new@example.com',
  );
  confirmOutgoingReview();

  expect(await screen.findByText('AI-assisted estimate')).toBeOnTheScreen();
  expect(remoteAnalysis).toHaveBeenCalledTimes(1);
  expect(remoteAnalysis.mock.calls[0][0].map(({ sender, text }: { sender: string; text: string }) => ({ sender, text }))).toEqual([
    { sender: 'Person A', text: 'Email me at [EMAIL]' },
    { sender: 'Person B', text: 'Reach me at [EMAIL]' },
  ]);
  expect(grantConsent).not.toHaveBeenCalled();
});

it('sends the same confirmed snapshot after first-use consent and deduplicates agreement taps', async () => {
  remoteAnalysis.mockResolvedValue(aiResult);
  await renderPreview();
  await openFirstConsent();

  const agree = screen.getByRole('button', { name: 'Agree and continue' });
  fireEvent.press(agree);
  fireEvent.press(agree);

  expect(await screen.findByText('AI-assisted estimate')).toBeOnTheScreen();
  expect(grantConsent).toHaveBeenCalledTimes(1);
  expect(remoteAnalysis).toHaveBeenCalledTimes(1);
  expect(remoteAnalysis.mock.calls[0][0].map(({ text }: { text: string }) => text)).toEqual([
    'Email me at [EMAIL]',
    'Call [PHONE]',
  ]);
});

it('canceling review sends nothing and never checks or grants consent', async () => {
  await renderPreview();
  await openOutgoingReview();

  fireEvent.press(screen.getByRole('button', { name: 'Cancel remote analysis' }));

  expect(screen.queryByText('Automatic detection can miss identifying details. Review the exact text below.')).toBeNull();
  expect(getConsent).not.toHaveBeenCalled();
  expect(grantConsent).not.toHaveBeenCalled();
  expect(remoteAnalysis).not.toHaveBeenCalled();
});

it('editing the conversation from review sends nothing', async () => {
  await renderPreview();
  await openOutgoingReview();

  fireEvent.press(screen.getByRole('button', { name: 'Edit conversation' }));

  expect(remoteAnalysis).not.toHaveBeenCalled();
  expect(getConsent).not.toHaveBeenCalled();
});

it('running local analysis from an open review sends nothing', async () => {
  await renderPreview();
  await openOutgoingReview();

  fireEvent.press(screen.getByRole('button', { name: 'Run on-device analysis' }));

  expect(await screen.findByText('On-device estimate')).toBeOnTheScreen();
  expect(remoteAnalysis).not.toHaveBeenCalled();
  expect(getConsent).not.toHaveBeenCalled();
});

it('unmounting an unconfirmed review sends nothing', async () => {
  const rendered = await renderPreview();
  await openOutgoingReview();

  rendered.unmount();

  expect(remoteAnalysis).not.toHaveBeenCalled();
  expect(getConsent).not.toHaveBeenCalled();
});

it('cancels the active request and ignores a late success', async () => {
  let resolveRemote: ((result: AnalysisResult) => void) | undefined;
  let remoteSignal: AbortSignal | undefined;
  remoteAnalysis.mockImplementation((_messages: unknown, signal: AbortSignal) => new Promise<AnalysisResult>((resolve) => {
    resolveRemote = resolve;
    remoteSignal = signal;
  }));
  await renderPreview();
  await openFirstConsent();
  fireEvent.press(screen.getByRole('button', { name: 'Agree and continue' }));

  fireEvent.press(await screen.findByRole('button', { name: 'Cancel AI analysis' }));
  expect(remoteSignal?.aborted).toBe(true);
  resolveRemote?.(aiResult);

  expect(await screen.findByText('Review your conversation')).toBeOnTheScreen();
  expect(screen.queryByText('AI-assisted estimate')).toBeNull();
});

it('does not start remote analysis when cancellation occurs during consent persistence', async () => {
  let resolveGrant: (() => void) | undefined;
  grantConsent.mockImplementation(() => new Promise((resolve) => { resolveGrant = () => resolve(currentConsent); }));
  await renderPreview();
  await openFirstConsent();
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
  await openFirstConsent();
  fireEvent.press(screen.getByRole('button', { name: 'Agree and continue' }));
  await screen.findByRole('button', { name: 'Cancel AI analysis' });

  rendered.unmount();

  expect(remoteSignal?.aborted).toBe(true);
});

it('does not continue a pending consent lookup after unmount', async () => {
  let resolveConsent: ((value: null) => void) | undefined;
  getConsent.mockImplementation(() => new Promise<null>((resolve) => { resolveConsent = resolve; }));
  const rendered = await renderPreview();
  await openOutgoingReview();
  confirmOutgoingReview();

  rendered.unmount();
  resolveConsent?.(null);
  await Promise.resolve();

  expect(grantConsent).not.toHaveBeenCalled();
  expect(remoteAnalysis).not.toHaveBeenCalled();
});

it('keeps the preview available after consent persistence fails', async () => {
  grantConsent.mockRejectedValue(new Error('storage detail must not be displayed'));
  await renderPreview();
  await openFirstConsent();
  fireEvent.press(screen.getByRole('button', { name: 'Agree and continue' }));

  expect(await screen.findByText("AI-assisted analysis couldn't be completed. Your conversation is still available.")).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Run on-device analysis instead' })).toBeOnTheScreen();
  expect(remoteAnalysis).not.toHaveBeenCalled();
});

it('keeps the draft and offers an on-device alternative after an AI failure', async () => {
  remoteAnalysis.mockRejectedValue(new Error('network details must not reach the screen'));
  await renderPreview();
  await openFirstConsent();
  fireEvent.press(screen.getByRole('button', { name: 'Agree and continue' }));

  fireEvent.press(await screen.findByRole('button', { name: 'Run on-device analysis instead' }));

  expect(await screen.findByText('On-device estimate')).toBeOnTheScreen();
});

it.each([
  ['NOT_CONFIGURED', 'AI-assisted analysis is not configured. On-device analysis is available.'],
  ['SERVICE_UNAVAILABLE', 'AI-assisted analysis is temporarily unavailable. Your conversation is still available.'],
] as const)('distinguishes %s from a generic remote failure', async (code, expectedMessage) => {
  remoteAnalysis.mockRejectedValue(new AiClientError(code));
  await renderPreview();
  await openFirstConsent();
  fireEvent.press(screen.getByRole('button', { name: 'Agree and continue' }));

  expect(await screen.findByText(expectedMessage)).toBeOnTheScreen();
});

it('shows a validated rate-limit retry separately while keeping the local action', async () => {
  remoteAnalysis.mockRejectedValue(new AiClientError('RATE_LIMITED', 37));
  await renderPreview();
  await openFirstConsent();
  fireEvent.press(screen.getByRole('button', { name: 'Agree and continue' }));

  expect(await screen.findByText('AI-assisted analysis rate limit reached. Try again in 37 seconds.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Run on-device analysis instead' })).toBeOnTheScreen();
});
