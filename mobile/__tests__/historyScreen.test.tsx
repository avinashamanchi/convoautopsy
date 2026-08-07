import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { FlatList } from 'react-native';
import { router } from 'expo-router';
import ResultScreen from '../app/result';
import HistoryScreen from '../app/(tabs)/history';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { ReportRepositoryProvider, useReportRepository } from '../src/services/reportRepositoryContext';
import type { AnalysisResult } from '../src/domain/analysis';
import type { PreferenceStore, ReportRepository, SavedReport } from '../src/services/reportRepository';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useFocusEffect: (effect: () => void | (() => void)) => require('react').useEffect(effect, [effect]),
}));

jest.mock('../src/services/expoSqlitePort', () => ({
  openExpoSqlitePort: jest.fn(),
}));

jest.mock('../src/state/AnalysisSession', () => ({
  useAnalysisSession: jest.fn(),
}));

jest.mock('../src/billing/BillingProvider', () => ({
  useBilling: () => ({ entitlementActive: false }),
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
  public deleteError: Error | null = null;
  public initializeFailures = 0;
  public listFailures = 0;

  constructor(reports: SavedReport[] = []) { this.reports = reports; }
  async initialize() {
    if (this.initializeFailures > 0) {
      this.initializeFailures -= 1;
      throw new Error('storage unavailable');
    }
  }
  async listPage({ query, cursor, limit = 50 }: Parameters<ReportRepository['listPage']>[0] = {}) {
    if (this.listFailures > 0) {
      this.listFailures -= 1;
      throw new Error('list unavailable');
    }
    const needle = query?.toLocaleLowerCase() ?? '';
    const matching = this.reports
      .filter((report) => report.title.toLocaleLowerCase().includes(needle))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id));
    const start = cursor ? matching.findIndex((report) => report.id === cursor.id) + 1 : 0;
    const items = matching.slice(start, start + Math.min(50, limit)).map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt }));
    const last = items.at(-1);
    return { items, nextCursor: start + items.length < matching.length && last ? { id: last.id, updatedAt: last.updatedAt } : null };
  }
  async count() { return this.reports.length; }
  async getTrendSummary() { return { reportCount: 0, averageIntensity: null, conflictModes: {}, patterns: {} }; }
  async get(id: string) { return this.reports.find((report) => report.id === id) ?? null; }
  async save(report: SavedReport) {
    if (this.saveError) throw this.saveError;
    this.reports = [...this.reports.filter((item) => item.id !== report.id), report];
  }
  async delete(id: string) {
    if (this.deleteError) throw this.deleteError;
    this.reports = this.reports.filter((report) => report.id !== id);
  }
  async deleteAll() { this.reports = []; }
}

class DeferredDeleteRepository extends MemoryReportRepository {
  deleteStarted = false;
  deleteAllStarted = false;
  private releaseDeleteOperation!: () => void;
  private releaseDeleteAllOperation!: () => void;
  private readonly deleteGate = new Promise<void>((resolve) => { this.releaseDeleteOperation = resolve; });
  private readonly deleteAllGate = new Promise<void>((resolve) => { this.releaseDeleteAllOperation = resolve; });

  override async delete(id: string) {
    this.deleteStarted = true;
    await this.deleteGate;
    await super.delete(id);
  }

  override async deleteAll() {
    this.deleteAllStarted = true;
    await this.deleteAllGate;
    await super.deleteAll();
  }

  releaseDelete() { this.releaseDeleteOperation(); }
  releaseDeleteAll() { this.releaseDeleteAllOperation(); }
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

function DeleteAllButton() {
  const { repository } = useReportRepository();
  return <PrimaryButton label="Test delete all" onPress={() => { void repository.deleteAll(); }} />;
}

beforeEach(() => {
  jest.useFakeTimers();
  useAnalysisSession.mockReturnValue({
    activeResult: result, draft: 'Alex: Can we talk?', reset: jest.fn(),
  });
  jest.clearAllMocks();
});

afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
});

it('shows a useful empty history state', async () => {
  const view = renderHistory();
  expect(await screen.findByText('No saved analyses yet.')).toBeOnTheScreen();
  expect(view.UNSAFE_getByType(FlatList).props.testID).toBe('history-list');
});

it('loads only the first bounded page of a large report history', async () => {
  const reports = Array.from({ length: 200 }, (_, index) => savedReport({ id: `report-${index}`, title: `Report ${index}` }));
  const view = renderHistory(new MemoryReportRepository(reports));

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(view.UNSAFE_getByType(FlatList).props.data).toHaveLength(50);
  expect(view.UNSAFE_getByType(FlatList).props.keyboardShouldPersistTaps).toBe('handled');
  act(() => {
    view.unmount();
    jest.clearAllTimers();
  });
});

it('retries failed initialization before allowing history to render', async () => {
  const repository = new MemoryReportRepository();
  repository.initializeFailures = 1;
  renderHistory(repository);

  expect(await screen.findByText('Storage is unavailable. Your saved analyses could not be opened.')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Retry storage' }));

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

it('distinguishes no search matches from an empty history', async () => {
  renderHistory(new MemoryReportRepository([savedReport()]));
  await screen.findByText('Friday conversation');

  fireEvent.changeText(screen.getByLabelText('Search saved analyses'), 'missing');

  expect(await screen.findByText('No saved analyses match your search.')).toBeOnTheScreen();
  expect(screen.queryByText('No saved analyses yet.')).toBeNull();
});

it('saves a result without original text unless the user opts in', async () => {
  const repository = new MemoryReportRepository();
  render(
    <ReportRepositoryProvider preferenceStore={preferences} repository={repository}>
      <ResultScreen createReportId={() => '0cb5b617-8c6e-4120-a3cb-eec7589569a0'} />
    </ReportRepositoryProvider>,
  );

  fireEvent.press(await screen.findByRole('button', { name: 'Save analysis' }));
  expect(screen.getByText('Keep original conversation text?')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Save privately' }));

  await waitFor(() => expect(repository.reports).toHaveLength(1));
  expect(repository.reports[0].sourceText).toBeNull();
  expect(repository.reports[0].id).toBe('0cb5b617-8c6e-4120-a3cb-eec7589569a0');
  expect(screen.getByText('Analysis saved on this device.')).toBeOnTheScreen();
  fireEvent.press(screen.getByTestId('open-history'));
  expect(router.replace).toHaveBeenCalledWith('/(tabs)/history');
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

it('keeps the report visible and offers a retry when deletion fails', async () => {
  const repository = new MemoryReportRepository([savedReport()]);
  repository.deleteError = new Error('database locked');
  renderHistory(repository);
  await screen.findByText('Friday conversation');

  fireEvent.press(screen.getByRole('button', { name: 'Delete Friday conversation' }));
  fireEvent.press(screen.getByRole('button', { name: 'Confirm delete Friday conversation' }));

  expect(await screen.findByText('Could not delete “Friday conversation”. Please try again.')).toBeOnTheScreen();
  expect(screen.getByText('Friday conversation')).toBeOnTheScreen();
  repository.deleteError = null;
  fireEvent.press(screen.getByRole('button', { name: 'Retry deleting Friday conversation' }));
  expect(await screen.findByText('No saved analyses yet.')).toBeOnTheScreen();
});

it('removes the deleted row and offers a retry when refreshing history fails', async () => {
  const repository = new MemoryReportRepository([savedReport()]);
  renderHistory(repository);
  await screen.findByText('Friday conversation');
  repository.listFailures = 1;

  fireEvent.press(screen.getByRole('button', { name: 'Delete Friday conversation' }));
  fireEvent.press(screen.getByRole('button', { name: 'Confirm delete Friday conversation' }));

  expect(await screen.findByText('Could not refresh saved analyses. Please try again.')).toBeOnTheScreen();
  expect(screen.queryByText('Friday conversation')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Retry loading saved analyses' }));
  expect(await screen.findByText('No saved analyses yet.')).toBeOnTheScreen();
});

it('does not re-retain a failed delete payload after delete-all invalidates it', async () => {
  const repository = new DeferredDeleteRepository([
    savedReport({ sourceText: 'Private conversation that must leave memory' }),
  ]);
  render(
    <ReportRepositoryProvider preferenceStore={preferences} repository={repository}>
      <HistoryScreen />
      <DeleteAllButton />
    </ReportRepositoryProvider>,
  );
  await screen.findByText('Friday conversation');

  fireEvent.press(screen.getByRole('button', { name: 'Delete Friday conversation' }));
  fireEvent.press(screen.getByRole('button', { name: 'Confirm delete Friday conversation' }));
  await waitFor(() => expect(repository.deleteStarted).toBe(true));
  fireEvent.press(screen.getByRole('button', { name: 'Test delete all' }));
  expect(await screen.findByText('No saved analyses yet.')).toBeOnTheScreen();

  await act(async () => {
    repository.releaseDelete();
    await Promise.resolve();
    await Promise.resolve();
  });
  await waitFor(() => expect(repository.deleteAllStarted).toBe(true));
  expect(screen.queryByText('Could not delete “Friday conversation”. Please try again.')).toBeNull();
  expect(screen.queryByText('Friday conversation')).toBeNull();
  expect(screen.queryByText('Private conversation that must leave memory')).toBeNull();

  await act(async () => { repository.releaseDeleteAll(); });
  expect(await screen.findByText('No saved analyses yet.')).toBeOnTheScreen();
});

it('opens a saved report from history', async () => {
  renderHistory(new MemoryReportRepository([savedReport()]));
  await screen.findByText('Friday conversation');

  fireEvent.press(screen.getByRole('button', { name: 'Open Friday conversation' }));

  expect(router.push).toHaveBeenCalledWith('/report/report-1');
});
