import { createRef } from 'react';
import { View } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ResultScreen from '../app/result';
import ReportScreen from '../app/report/[id]';
import type { AnalysisResult } from '../src/domain/analysis';
import { ReportRepositoryProvider } from '../src/services/reportRepositoryContext';
import type { PreferenceStore, ReportRepository, SavedReport } from '../src/services/reportRepository';
import { captureAndShareReport } from '../src/services/exportReport';
import { ShareableReportCard } from '../src/components/ShareableReportCard';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  useFocusEffect: (effect: () => void | (() => void)) => require('react').useEffect(effect, [effect]),
  useLocalSearchParams: () => ({ id: 'saved-report' }),
}));

jest.mock('../src/state/AnalysisSession', () => ({
  useAnalysisSession: () => ({
    activeResult: {
      schemaVersion: 1,
      mode: 'local',
      intensityScore: 42,
      conflictMode: 'Collaborating',
      messages: [
        { sender: 'Person A', text: 'private draft source', pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: 'A neutral message.' },
      ],
    },
    draft: 'Ava: unsaved original conversation',
    reset: jest.fn(),
  }),
}));

jest.mock('../src/billing/BillingProvider', () => ({
  useBilling: () => ({ entitlementActive: false }),
}));

jest.mock('../src/services/exportReport', () => ({
  captureAndShareReport: jest.fn(),
  reportExportFailureMessage: (outcome: { code: string }) => {
    if (outcome.code === 'SHARING_UNAVAILABLE') return 'Sharing is unavailable on this device. Please try again later.';
    if (outcome.code === 'CAPTURE_FAILED') return 'Could not prepare the private report image. Please try again.';
    return 'Could not open the share sheet. Please try again.';
  },
}));

const mockedCaptureAndShare = captureAndShareReport as jest.MockedFunction<typeof captureAndShareReport>;

const result: AnalysisResult = {
  schemaVersion: 1,
  mode: 'local',
  intensityScore: 42,
  conflictMode: 'Collaborating',
  messages: [
    { sender: 'Person A', text: 'private draft source', pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: 'A neutral message.' },
  ],
};

class MemoryRepository implements ReportRepository {
  constructor(private readonly report: SavedReport | null) {}
  async initialize() {}
  async listPage() {
    return { items: this.report ? [{ id: this.report.id, title: this.report.title, createdAt: this.report.createdAt, updatedAt: this.report.updatedAt }] : [], nextCursor: null };
  }
  async count() { return this.report ? 1 : 0; }
  async getTrendSummary() { return { reportCount: 0, averageIntensity: null, conflictModes: {}, patterns: {} }; }
  async get() { return this.report; }
  async save() {}
  async delete() {}
  async deleteAll() {}
}

const preferences: PreferenceStore = {
  get: async () => null,
  set: async () => {},
  delete: async () => {},
  deleteAll: async () => {},
};

function renderWithRepository(component: React.ReactElement, report: SavedReport | null = null) {
  return render(
    <ReportRepositoryProvider repository={new MemoryRepository(report)} preferenceStore={preferences}>
      {component}
    </ReportRepositoryProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedCaptureAndShare.mockResolvedValue({ ok: true });
});

it('opens a report share sheet only after the current-result user presses share', async () => {
  renderWithRepository(<ResultScreen />);

  await screen.findByText('Intensity score (estimate): 42/100');
  expect(mockedCaptureAndShare).not.toHaveBeenCalled();
  fireEvent.press(await screen.findByRole('button', { name: 'Share report image' }));

  await waitFor(() => expect(mockedCaptureAndShare).toHaveBeenCalledTimes(1));
  expect(await screen.findByText('Share sheet opened. This does not confirm completion.')).toBeOnTheScreen();
});

it('opens a report share sheet from a saved result and gives a recoverable failure', async () => {
  mockedCaptureAndShare.mockResolvedValueOnce({ ok: false, code: 'SHARE_FAILED' });
  renderWithRepository(<ReportScreen />, {
    id: 'saved-report',
    title: 'Saved report',
    createdAt: '2026-08-02T12:00:00.000Z',
    updatedAt: '2026-08-02T12:00:00.000Z',
    sourceText: 'Ava: original private text',
    result,
    responseDrafts: [],
  });

  fireEvent.press(await screen.findByRole('button', { name: 'Share report image' }));

  await waitFor(() => expect(mockedCaptureAndShare).toHaveBeenCalledTimes(1));
  expect(await screen.findByText('Could not open the share sheet. Please try again.')).toBeOnTheScreen();
  fireEvent.press(screen.getByTestId('open-responses'));
  expect(require('expo-router').router.replace).toHaveBeenCalledWith('/(tabs)/responses');
});

it('distinguishes an unavailable sharing service without revealing report content', async () => {
  mockedCaptureAndShare.mockResolvedValueOnce({ ok: false, code: 'SHARING_UNAVAILABLE' });
  renderWithRepository(<ReportScreen />, {
    id: 'saved-report',
    title: 'Saved report',
    createdAt: '2026-08-02T12:00:00.000Z',
    updatedAt: '2026-08-02T12:00:00.000Z',
    sourceText: 'Ava: original private text',
    result,
    responseDrafts: [],
  });

  fireEvent.press(await screen.findByRole('button', { name: 'Share report image' }));

  expect(await screen.findByText('Sharing is unavailable on this device. Please try again later.')).toBeOnTheScreen();
  expect(screen.queryByText('Ava: original private text')).toBeNull();
});

it('keeps six bounded redacted rows and the educational limitation inside the capture canvas', () => {
  const ref = createRef<View>();
  const sixMessageResult: AnalysisResult = {
    ...result,
    messages: [
      { ...result.messages[0], sender: 'Person A', pattern: 'Criticism' },
      { ...result.messages[0], sender: 'Person B', pattern: 'Contempt' },
      { ...result.messages[0], sender: 'Person C', pattern: 'Defensiveness' },
      { ...result.messages[0], sender: 'Person D', pattern: 'Stonewalling' },
      { ...result.messages[0], sender: 'Person E', pattern: 'Neutral' },
      { ...result.messages[0], sender: 'Person F', pattern: 'Criticism' },
      { ...result.messages[0], sender: 'Person G', pattern: 'Neutral' },
    ],
  };
  render(<ShareableReportCard generatedAt="2026-08-02T12:00:00.000Z" ref={ref} result={sixMessageResult} />);

  expect(ref.current).toBeTruthy();
  expect(screen.getAllByTestId('shareable-report-row', { includeHiddenElements: true })).toHaveLength(6);
  expect(screen.getByText('Participant 6', { includeHiddenElements: true })).toBeOnTheScreen();
  expect(screen.getAllByText('[Message content redacted]', { includeHiddenElements: true })).toHaveLength(6);
  expect(screen.getByText('Pattern label: Stonewalling', { includeHiddenElements: true })).toBeOnTheScreen();
  expect(screen.getByTestId('shareable-report-limitation', { includeHiddenElements: true })).toBeOnTheScreen();
  expect(screen.getByTestId('shareable-report-canvas', { includeHiddenElements: true }).props.style).toMatchObject({ height: 640, overflow: 'hidden', width: 360 });
  expect(screen.getAllByTestId('shareable-report-row', { includeHiddenElements: true })[0].props.style).toMatchObject({ height: 39, maxHeight: 39, overflow: 'hidden' });
  expect(screen.getByTestId('shareable-report-limitation', { includeHiddenElements: true }).props.style).toMatchObject({ height: 62, overflow: 'hidden' });
  expect(screen.queryByText('Person A', { includeHiddenElements: true })).toBeNull();
  expect(screen.queryByText('private draft source', { includeHiddenElements: true })).toBeNull();
});

it.each([
  ['local', 'Analysis mode: On-device estimate'],
  ['ai', 'Analysis mode: AI-assisted estimate'],
] as const)('labels a %s capture explicitly without a mode-inaccurate limitation', (mode, modeLabel) => {
  render(<ShareableReportCard generatedAt="2026-08-02T12:00:00.000Z" result={{ ...result, mode }} />);

  expect(screen.getByText(modeLabel, { includeHiddenElements: true })).toBeOnTheScreen();
  expect(screen.getByText('This educational estimate may be incomplete or wrong and is not a factual conclusion about people or relationships.', { includeHiddenElements: true })).toBeOnTheScreen();
  if (mode === 'ai') {
    expect(screen.queryByText(/This on-device estimate/, { includeHiddenElements: true })).toBeNull();
  }
});
