import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import ResponsesScreen from '../app/(tabs)/responses';
import ResponseScreen from '../app/response/[reportId]';
import { ReportRepositoryProvider } from '../src/services/reportRepositoryContext';
import type { AnalysisResult } from '../src/domain/analysis';
import type { PreferenceStore, ReportRepository, SavedReport } from '../src/services/reportRepository';

const mockFiles: Array<{ uri: string; write: jest.Mock }> = [];

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useLocalSearchParams: () => ({ reportId: 'report-1' }),
}));

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: '/cache' },
  File: class {
    uri = `file:///cache/response-${mockFiles.length + 1}.txt`;
    write = jest.fn();
    constructor() { mockFiles.push(this); }
  },
}));

const result: AnalysisResult = {
  schemaVersion: 1,
  mode: 'local',
  intensityScore: 42,
  conflictMode: 'Collaborating',
  messages: [
    { sender: 'Person A', text: 'Can we talk?', pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: 'This wording may reflect an attempt to communicate without a clear hostile pattern.' },
    { sender: 'Person B', text: 'Not now.', pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: 'This wording may reflect a request for space without a clear hostile pattern.' },
  ],
};

function savedReport(overrides: Partial<SavedReport> = {}): SavedReport {
  return {
    id: 'report-1', title: 'Friday conversation', createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z', sourceText: null, result, responseDrafts: [], ...overrides,
  };
}

class MemoryReportRepository implements ReportRepository {
  reports: SavedReport[];
  saveError: Error | null = null;

  constructor(reports: SavedReport[] = [savedReport()]) { this.reports = reports; }
  async initialize() {}
  async list() { return this.reports; }
  async get(id: string) { return this.reports.find((report) => report.id === id) ?? null; }
  async save(report: SavedReport) {
    if (this.saveError) throw this.saveError;
    this.reports = [...this.reports.filter((item) => item.id !== report.id), report];
  }
  async delete() {}
  async deleteAll() {}
}

const preferences: PreferenceStore = {
  get: async () => null, set: async () => {}, delete: async () => {}, deleteAll: async () => {},
};

function renderResponse(repository = new MemoryReportRepository()) {
  return {
    repository,
    ...render(
      <ReportRepositoryProvider repository={repository} preferenceStore={preferences}>
        <ResponseScreen />
      </ReportRepositoryProvider>,
    ),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.splice(0, mockFiles.length);
  (jest.requireMock('expo-clipboard') as { setStringAsync: jest.Mock }).setStringAsync.mockResolvedValue(true);
  (jest.requireMock('expo-sharing') as { shareAsync: jest.Mock }).shareAsync.mockResolvedValue(undefined);
});

it('selects a saved report before opening the response wizard', async () => {
  render(
    <ReportRepositoryProvider repository={new MemoryReportRepository()} preferenceStore={preferences}>
      <ResponsesScreen />
    </ReportRepositoryProvider>,
  );

  fireEvent.press(await screen.findByRole('button', { name: 'Draft responses for Friday conversation' }));

  expect(router.push).toHaveBeenCalledWith('/response/report-1');
});

it('requires sender, goal, and tone before generating exactly three drafts and saving them', async () => {
  const { repository } = renderResponse();

  expect(await screen.findByText('Step 1 of 4: Report')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Generate drafts' }).props.accessibilityState.disabled).toBe(true);

  fireEvent.press(screen.getByRole('button', { name: 'Person A' }));
  expect(screen.getByText('Step 2 of 4: Sender')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Resolve the conflict' }));
  expect(screen.getByText('Step 3 of 4: Goal')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Direct & clear' }));
  expect(screen.getByText('Step 4 of 4: Tone')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Generate drafts' }).props.accessibilityState.disabled).toBe(false);

  fireEvent.press(screen.getByRole('button', { name: 'Generate drafts' }));

  expect(await screen.findAllByText('Draft—review before sending')).toHaveLength(3);
  await waitFor(() => expect(repository.reports[0].responseDrafts).toHaveLength(3));
  expect(repository.reports[0].responseDrafts.map((draft) => draft.id)).toEqual([
    'resolve-direct-1', 'resolve-direct-2', 'resolve-direct-3',
  ]);
});

it('copies and shares only after the respective user presses', async () => {
  renderResponse();
  await screen.findByText('Step 1 of 4: Report');
  fireEvent.press(screen.getByRole('button', { name: 'Person A' }));
  fireEvent.press(screen.getByRole('button', { name: 'Resolve the conflict' }));
  fireEvent.press(screen.getByRole('button', { name: 'Direct & clear' }));
  fireEvent.press(screen.getByRole('button', { name: 'Generate drafts' }));
  await screen.findAllByText('Draft—review before sending');

  const clipboard = jest.requireMock('expo-clipboard') as { setStringAsync: jest.Mock };
  const sharing = jest.requireMock('expo-sharing') as { shareAsync: jest.Mock };

  expect(clipboard.setStringAsync).not.toHaveBeenCalled();
  expect(sharing.shareAsync).not.toHaveBeenCalled();
  fireEvent.press(screen.getAllByRole('button', { name: 'Copy draft' })[0]);
  await waitFor(() => expect(clipboard.setStringAsync).toHaveBeenCalledTimes(1));
  await screen.findByText('Copied to clipboard. Review before sending.');
  expect(sharing.shareAsync).not.toHaveBeenCalled();

  fireEvent.press(screen.getAllByRole('button', { name: 'Share draft' })[0]);
  await waitFor(() => expect(sharing.shareAsync).toHaveBeenCalledTimes(1));
  expect(mockFiles[0].write).toHaveBeenCalledTimes(1);
});

it('resets the wizard without deleting the saved analysis', async () => {
  renderResponse();
  await screen.findByText('Step 1 of 4: Report');
  fireEvent.press(screen.getByRole('button', { name: 'Person A' }));
  fireEvent.press(screen.getByRole('button', { name: 'Resolve the conflict' }));
  fireEvent.press(screen.getByRole('button', { name: 'Direct & clear' }));
  fireEvent.press(screen.getByRole('button', { name: 'Generate drafts' }));
  await screen.findAllByText('Draft—review before sending');

  fireEvent.press(screen.getByRole('button', { name: 'Reset draft choices' }));

  expect(screen.getByText('Step 1 of 4: Report')).toBeOnTheScreen();
  expect(screen.queryByText('Draft—review before sending')).toBeNull();
  expect(screen.getByRole('button', { name: 'Generate drafts' }).props.accessibilityState.disabled).toBe(true);
});

it('shows a recoverable persistence failure while keeping generated drafts visible', async () => {
  const repository = new MemoryReportRepository();
  repository.saveError = new Error('disk full');
  renderResponse(repository);
  await screen.findByText('Step 1 of 4: Report');
  fireEvent.press(screen.getByRole('button', { name: 'Person A' }));
  fireEvent.press(screen.getByRole('button', { name: 'Resolve the conflict' }));
  fireEvent.press(screen.getByRole('button', { name: 'Direct & clear' }));
  fireEvent.press(screen.getByRole('button', { name: 'Generate drafts' }));

  expect(await screen.findByText('Could not save these drafts. Please try again.')).toBeOnTheScreen();
  expect(screen.getAllByText('Draft—review before sending')).toHaveLength(3);
  repository.saveError = null;
  fireEvent.press(screen.getByRole('button', { name: 'Retry saving drafts' }));
  await waitFor(() => expect(repository.reports[0].responseDrafts).toHaveLength(3));
});
