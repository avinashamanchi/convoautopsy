import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import ResultScreen from '../app/result';
import HistoryScreen from '../app/(tabs)/history';
import { ReportRepositoryProvider } from '../src/services/reportRepositoryContext';
import type { AnalysisResult } from '../src/domain/analysis';
import type { PreferenceStore, ReportRepository, SavedReport } from '../src/services/reportRepository';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

jest.mock('../src/services/expoSqlitePort', () => ({
  openExpoSqlitePort: jest.fn(),
}));

jest.mock('../src/state/AnalysisSession', () => ({
  useAnalysisSession: jest.fn(),
}));

const { useAnalysisSession } = jest.requireMock('../src/state/AnalysisSession') as {
  useAnalysisSession: jest.Mock;
};

const result: AnalysisResult = {
  schemaVersion: 1,
  mode: 'local',
  intensityScore: 42,
  conflictMode: 'Collaborating',
  messages: [{
    sender: 'Person A', text: 'Can we talk?', pattern: 'Neutral', egoState: 'Adult',
    possibleInterpretation: 'This wording may reflect an attempt to communicate without a clear hostile pattern.',
  }],
};

function savedReport(overrides: Partial<SavedReport> = {}): SavedReport {
  return {
    id: 'report-1', title: 'Friday conversation', createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z', sourceText: null, result, responseDrafts: [], ...overrides,
  };
}

class MemoryReportRepository implements ReportRepository {
  public reports: SavedReport[];
  public saveError: Error | null = null;

  constructor(reports: SavedReport[] = []) { this.reports = reports; }
  async initialize() {}
  async list(query?: string) {
    const needle = query?.toLocaleLowerCase() ?? '';
    return this.reports
      .filter((report) => report.title.toLocaleLowerCase().includes(needle))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
  async get(id: string) { return this.reports.find((report) => report.id === id) ?? null; }
  async save(report: SavedReport) {
    if (this.saveError) throw this.saveError;
    this.reports = [...this.reports.filter((item) => item.id !== report.id), report];
  }
  async delete(id: string) { this.reports = this.reports.filter((report) => report.id !== id); }
  async deleteAll() { this.reports = []; }
}

const preferences: PreferenceStore = {
  get: async () => null, set: async () => {}, delete: async () => {}, deleteAll: async () => {},
};

function renderHistory(repository = new MemoryReportRepository()) {
  return render(
    <ReportRepositoryProvider preferenceStore={preferences} repository={repository}>
      <HistoryScreen />
    </ReportRepositoryProvider>,
  );
}

beforeEach(() => {
  useAnalysisSession.mockReturnValue({
    activeResult: result, draft: 'Alex: Can we talk?', reset: jest.fn(),
  });
  jest.clearAllMocks();
});

it('shows a useful empty history state', async () => {
  renderHistory();
  expect(await screen.findByText('No saved analyses yet.')).toBeOnTheScreen();
});

it('filters saved report titles as the user searches', async () => {
  renderHistory(new MemoryReportRepository([
    savedReport(), savedReport({ id: 'report-2', title: 'Saturday check-in' }),
  ]));
  await screen.findByText('Friday conversation');

  fireEvent.changeText(screen.getByLabelText('Search saved analyses'), 'sAtUrDaY');

  expect(await screen.findByText('Saturday check-in')).toBeOnTheScreen();
  expect(screen.queryByText('Friday conversation')).toBeNull();
});

it('saves a result without original text unless the user opts in', async () => {
  const repository = new MemoryReportRepository();
  render(
    <ReportRepositoryProvider preferenceStore={preferences} repository={repository}>
      <ResultScreen />
    </ReportRepositoryProvider>,
  );

  fireEvent.press(await screen.findByRole('button', { name: 'Save analysis' }));
  expect(screen.getByText('Keep original conversation text?')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Save privately' }));

  await waitFor(() => expect(repository.reports).toHaveLength(1));
  expect(repository.reports[0].sourceText).toBeNull();
  expect(screen.getByText('Analysis saved on this device.')).toBeOnTheScreen();
});

it('shows a save failure without claiming the result was saved', async () => {
  const repository = new MemoryReportRepository();
  repository.saveError = new Error('disk full');
  render(
    <ReportRepositoryProvider preferenceStore={preferences} repository={repository}>
      <ResultScreen />
    </ReportRepositoryProvider>,
  );

  fireEvent.press(await screen.findByRole('button', { name: 'Save analysis' }));
  fireEvent.press(screen.getByRole('button', { name: 'Save privately' }));

  expect(await screen.findByText('Could not save this analysis. Please try again.')).toBeOnTheScreen();
  expect(screen.queryByText('Analysis saved on this device.')).toBeNull();
});

it('requires a title-specific confirmation before deletion', async () => {
  const repository = new MemoryReportRepository([savedReport()]);
  renderHistory(repository);
  await screen.findByText('Friday conversation');

  fireEvent.press(screen.getByRole('button', { name: 'Delete Friday conversation' }));
  expect(screen.getByText('Delete “Friday conversation”?')).toBeOnTheScreen();
  expect(repository.reports).toHaveLength(1);
  fireEvent.press(screen.getByRole('button', { name: 'Confirm delete Friday conversation' }));

  expect(await screen.findByText('No saved analyses yet.')).toBeOnTheScreen();
  expect(repository.reports).toHaveLength(0);
});

it('opens a saved report from history', async () => {
  renderHistory(new MemoryReportRepository([savedReport()]));
  await screen.findByText('Friday conversation');

  fireEvent.press(screen.getByRole('button', { name: 'Open Friday conversation' }));

  expect(router.push).toHaveBeenCalledWith('/report/report-1');
});
