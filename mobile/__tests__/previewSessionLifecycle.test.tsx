jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn() } }));
jest.mock('../src/services/reportRepositoryContext', () => ({
  useReportRepository: () => ({ preferences: { get: jest.fn(), set: jest.fn(), delete: jest.fn(), deleteAll: jest.fn() } }),
}));
jest.mock('../src/services/consentStore', () => ({ createConsentStore: jest.fn() }));
jest.mock('../src/services/aiClient', () => ({ createAiClient: jest.fn() }));
jest.mock('../src/billing/BillingProvider', () => ({ useBilling: () => ({ appUserId: '$RCAnonymousID:preview-test', identityStatus: 'ready', entitlementStatus: 'free' }) }));

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import PreviewScreen from '../app/preview';
import type { AnalysisResult } from '../src/domain/analysis';
import { createAiClient } from '../src/services/aiClient';
import { createConsentStore } from '../src/services/consentStore';
import {
  AnalysisSessionProvider,
  type AnalysisSessionValue,
  useAnalysisSession,
} from '../src/state/AnalysisSession';

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

function StatusProbe({ onSession }: { onSession: (session: AnalysisSessionValue) => void }) {
  const session = useAnalysisSession();
  useEffect(() => { onSession(session); }, [onSession, session]);
  return null;
}

function TestRoute({ onSession, showPreview }: { onSession: (session: AnalysisSessionValue) => void; showPreview: boolean }) {
  return (
    <AnalysisSessionProvider>
      <StatusProbe onSession={onSession} />
      {showPreview ? <PreviewScreen /> : null}
    </AnalysisSessionProvider>
  );
}

beforeEach(() => {
  remoteAnalysis = jest.fn();
  mockedCreateAiClient.mockReturnValue(remoteAnalysis);
  mockedCreateConsentStore.mockReturnValue({
    getConsent: jest.fn().mockResolvedValue(null),
    grantConsent: jest.fn().mockResolvedValue({ version: '2026-08-07.2', grantedAt: '2026-08-07T00:00:00.000Z', provider: 'Groq' }),
    revokeConsent: jest.fn(),
    getInstallationToken: jest.fn(),
    clearRemoteAnalysisData: jest.fn(), clearInstallationToken: jest.fn(),
  });
});

async function preparePreview(session: AnalysisSessionValue | undefined) {
  act(() => { session?.setDraft('Alex: Can we talk?\nJordan: Not now.'); });
  await screen.findByRole('button', { name: 'Run on-device analysis' });
}

it('keeps a local result status when the preview route unmounts after routing', async () => {
  let session: AnalysisSessionValue | undefined;
  const onSession = (value: AnalysisSessionValue) => { session = value; };
  const rendered = render(<TestRoute onSession={onSession} showPreview />);
  await preparePreview(session);

  fireEvent.press(screen.getByRole('button', { name: 'Run on-device analysis' }));
  await waitFor(() => expect(session?.status).toBe('result'));

  rendered.rerender(<TestRoute onSession={onSession} showPreview={false} />);

  expect(session?.status).toBe('result');
  expect(session?.activeResult?.mode).toBe('local');
});

it('keeps an AI result status when the preview route unmounts after routing', async () => {
  remoteAnalysis.mockResolvedValue(aiResult);
  let session: AnalysisSessionValue | undefined;
  const onSession = (value: AnalysisSessionValue) => { session = value; };
  const rendered = render(<TestRoute onSession={onSession} showPreview />);
  await preparePreview(session);

  fireEvent.press(screen.getByRole('button', { name: 'Use AI-assisted analysis' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Confirm exact text' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Agree and continue' }));
  await waitFor(() => expect(session?.status).toBe('result'));

  rendered.rerender(<TestRoute onSession={onSession} showPreview={false} />);

  expect(session?.status).toBe('result');
  expect(session?.activeResult?.mode).toBe('ai');
});
