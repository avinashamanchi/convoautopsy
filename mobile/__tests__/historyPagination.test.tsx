import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { FlatList } from 'react-native';
import HistoryScreen from '../app/(tabs)/history';
import ResponsesScreen from '../app/(tabs)/responses';
import { ReportRepositoryProvider } from '../src/services/reportRepositoryContext';
import type {
  PreferenceStore,
  ReportPage,
  ReportPageRequest,
  ReportRepository,
  SavedReport,
  SavedReportListItem,
  TrendSummary,
} from '../src/services/reportRepository';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (effect: () => void | (() => void)) => require('react').useEffect(effect, [effect]),
}));

const preferences: PreferenceStore = {
  get: async () => null, set: async () => {}, delete: async () => {}, deleteAll: async () => {},
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
});

const result = {
  schemaVersion: 1 as const,
  mode: 'local' as const,
  intensityScore: 42,
  conflictMode: 'Collaborating' as const,
  messages: [{
    sender: 'Person A', text: 'Can we talk?', pattern: 'Neutral' as const, egoState: 'Adult' as const,
    possibleInterpretation: 'This wording may reflect an attempt to communicate without a clear hostile pattern.',
  }],
};

function report(index: number): SavedReport {
  return {
    id: `report-${String(index).padStart(3, '0')}`,
    title: `Report ${index}`,
    createdAt: `2026-08-01T00:${String(index % 60).padStart(2, '0')}:00.000Z`,
    updatedAt: `2026-08-01T00:${String(index % 60).padStart(2, '0')}:00.000Z`,
    sourceText: null,
    result,
    responseDrafts: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; });
  return { promise, resolve, reject };
}

class PaginatedMemoryRepository implements ReportRepository {
  readonly calls: ReportPageRequest[] = [];
  failNextPage = false;
  deferNextPage = false;
  readonly pendingPage = deferred<ReportPage>();
  reports: SavedReport[];

  constructor(count = 75) { this.reports = Array.from({ length: count }, (_, index) => report(index)); }
  async initialize() {}
  async count() { return this.reports.length; }
  async getTrendSummary(): Promise<TrendSummary> { return { reportCount: 0, averageIntensity: null, conflictModes: {}, patterns: {} }; }
  async listPage(request: ReportPageRequest = {}) {
    this.calls.push(request);
    if (request.cursor && this.deferNextPage) return this.pendingPage.promise;
    if (request.cursor && this.failNextPage) {
      this.failNextPage = false;
      throw new Error('page unavailable');
    }
    const matching = this.reports.filter((item) => item.title.toLocaleLowerCase().includes(request.query?.toLocaleLowerCase() ?? ''));
    const start = request.cursor ? matching.findIndex((item) => item.id === request.cursor?.id) + 1 : 0;
    const size = Math.min(50, Math.max(1, request.limit ?? 50));
    const items: SavedReportListItem[] = matching.slice(start, start + size).map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt }));
    const last = items.at(-1);
    return {
      items,
      nextCursor: start + size < matching.length && last ? { id: last.id, updatedAt: last.updatedAt } : null,
    };
  }
  async get(id: string) { return this.reports.find((item) => item.id === id) ?? null; }
  async save(next: SavedReport) { this.reports = [...this.reports.filter((item) => item.id !== next.id), next]; }
  async delete(id: string) { this.reports = this.reports.filter((item) => item.id !== id); }
  async deleteAll() { this.reports = []; }
}

class DeferredInitialRepository extends PaginatedMemoryRepository {
  readonly firstPage = deferred<ReportPage>();
  override async listPage(request: ReportPageRequest = {}) {
    if (!request.query) {
      this.calls.push(request);
      return this.firstPage.promise;
    }
    return super.listPage(request);
  }
}

function renderWithRepository(screenNode: React.ReactElement, repository: ReportRepository) {
  return render(
    <ReportRepositoryProvider repository={repository} preferenceStore={preferences}>
      {screenNode}
    </ReportRepositoryProvider>,
  );
}

it('loads history in 50-row pages and deduplicates repeated end-reached events', async () => {
  const repository = new PaginatedMemoryRepository();
  repository.deferNextPage = true;
  const view = renderWithRepository(<HistoryScreen />, repository);
  await screen.findByText('Report 0');
  const list = view.UNSAFE_getByType(FlatList);
  expect(list.props.data).toHaveLength(50);

  act(() => {
    list.props.onEndReached();
    list.props.onEndReached();
  });
  expect(repository.calls).toHaveLength(2);

  const remaining = repository.reports.slice(50).map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt }));
  await act(async () => repository.pendingPage.resolve({ items: remaining, nextCursor: null }));
  await waitFor(() => expect(view.UNSAFE_getByType(FlatList).props.data).toHaveLength(75));
});

it('retains visible history rows when a later page fails and retries that cursor', async () => {
  const repository = new PaginatedMemoryRepository();
  repository.failNextPage = true;
  const view = renderWithRepository(<HistoryScreen />, repository);
  await screen.findByText('Report 0');

  act(() => view.UNSAFE_getByType(FlatList).props.onEndReached());
  expect(await screen.findByText('Could not load more saved analyses.')).toBeOnTheScreen();
  expect(view.UNSAFE_getByType(FlatList).props.data).toHaveLength(50);
  fireEvent.press(screen.getByRole('button', { name: 'Retry loading more saved analyses' }));

  await waitFor(() => expect(view.UNSAFE_getByType(FlatList).props.data).toHaveLength(75));
  expect(repository.calls.at(-1)?.cursor?.id).toBe('report-049');
});

it('resets history pagination when the search query changes', async () => {
  const repository = new PaginatedMemoryRepository();
  const view = renderWithRepository(<HistoryScreen />, repository);
  await screen.findByText('Report 0');
  act(() => view.UNSAFE_getByType(FlatList).props.onEndReached());
  await waitFor(() => expect(view.UNSAFE_getByType(FlatList).props.data).toHaveLength(75));

  fireEvent.changeText(screen.getByLabelText('Search saved analyses'), 'Report 7');

  await waitFor(() => expect(view.UNSAFE_getByType(FlatList).props.data).toHaveLength(6));
  expect(repository.calls.at(-1)).toEqual(expect.objectContaining({ query: 'Report 7', cursor: undefined, limit: 50 }));
});

it('ignores a stale first page after the search generation changes', async () => {
  const repository = new DeferredInitialRepository();
  const view = renderWithRepository(<HistoryScreen />, repository);
  await screen.findByLabelText('Loading saved analyses');
  fireEvent.changeText(screen.getByLabelText('Search saved analyses'), 'Report 7');
  await screen.findByText('Report 7');

  await act(async () => repository.firstPage.resolve({
    items: [{ id: 'stale', title: 'Stale result', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }],
    nextCursor: null,
  }));

  expect(view.UNSAFE_getByType(FlatList).props.data).toHaveLength(6);
  expect(screen.queryByText('Stale result')).toBeNull();
});

it('uses an independently paginated FlatList for the response chooser', async () => {
  const repository = new PaginatedMemoryRepository();
  const view = renderWithRepository(<ResponsesScreen />, repository);
  await screen.findByText('Drafts stay on this device until you manually copy or share one.');
  const list = view.UNSAFE_getByType(FlatList);
  expect(list.props.data).toHaveLength(50);

  act(() => list.props.onEndReached());

  await waitFor(() => expect(view.UNSAFE_getByType(FlatList).props.data).toHaveLength(75));
  expect(repository.calls).toHaveLength(2);
});

it('keeps response rows and cursor available when loading a later page is retried', async () => {
  const repository = new PaginatedMemoryRepository();
  repository.failNextPage = true;
  const view = renderWithRepository(<ResponsesScreen />, repository);
  await screen.findByText('Drafts stay on this device until you manually copy or share one.');

  act(() => view.UNSAFE_getByType(FlatList).props.onEndReached());
  expect(await screen.findByText('Could not load more saved analyses.')).toBeOnTheScreen();
  expect(view.UNSAFE_getByType(FlatList).props.data).toHaveLength(50);
  fireEvent.press(screen.getByRole('button', { name: 'Retry loading more saved analyses' }));

  await waitFor(() => expect(view.UNSAFE_getByType(FlatList).props.data).toHaveLength(75));
  expect(repository.calls.at(-1)?.cursor?.id).toBe('report-049');
});
