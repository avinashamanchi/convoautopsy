import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import TrendsScreen from '../app/trends';
import HistoryScreen from '../app/(tabs)/history';
import { ReportRepositoryProvider } from '../src/services/reportRepositoryContext';
import type { PreferenceStore, ReportPage, ReportRepository, SavedReport, TrendSummary } from '../src/services/reportRepository';

jest.mock('../src/billing/BillingProvider', () => ({
  useBilling: () => ({ entitlementActive: false }),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (effect: () => void | (() => void)) => require('react').useEffect(effect, [effect]),
}));

const preferences: PreferenceStore = {
  get: async () => null, set: async () => {}, delete: async () => {}, deleteAll: async () => {},
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; });
  return { promise, resolve, reject };
}

class TrendRepository implements ReportRepository {
  calls: Array<[string, string]> = [];
  next = deferred<TrendSummary>();
  async initialize() {}
  async listPage(): Promise<ReportPage> { return { items: [], nextCursor: null }; }
  async count() { return 0; }
  async getTrendSummary(from: string, to: string) { this.calls.push([from, to]); return this.next.promise; }
  async get(): Promise<SavedReport | null> { return null; }
  async save() {}
  async delete() {}
  async deleteAll() {}
}

function renderScreen(node: React.ReactElement, repository: ReportRepository) {
  return render(
    <ReportRepositoryProvider repository={repository} preferenceStore={preferences}>
      {node}
    </ReportRepositoryProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('keeps Private Trends free and local while querying saved reports for free users', async () => {
  const repository = new TrendRepository();
  renderScreen(<TrendsScreen now={() => new Date('2026-08-07T12:00:00.000Z')} />, repository);

  expect(await screen.findByLabelText('Loading private trends')).toBeOnTheScreen();
  expect(repository.calls).toEqual([['2026-07-08T12:00:00.000Z', '2026-08-07T12:00:00.000Z']]);
  expect(screen.queryByText('Private Trends is a Convo Pro feature.')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Unlock Private Trends' })).toBeNull();
  await act(async () => repository.next.resolve({ reportCount: 0, averageIntensity: null, conflictModes: {}, patterns: {} }));
  expect(await screen.findByText('No saved analyses in this window.')).toBeOnTheScreen();
});

it('shows the exact local time window, bounded summary, and limitation', async () => {
  const repository = new TrendRepository();
  renderScreen(<TrendsScreen now={() => new Date('2026-08-07T12:00:00.000Z')} />, repository);
  expect(await screen.findByLabelText('Loading private trends')).toBeOnTheScreen();
  await act(async () => repository.next.resolve({
    reportCount: 2,
    averageIntensity: 35,
    conflictModes: { Collaborating: 2 },
    patterns: { Neutral: 3 },
  }));

  expect(await screen.findByText('2 saved analyses')).toBeOnTheScreen();
  expect(screen.getByText('Average intensity: 35')).toBeOnTheScreen();
  expect(screen.getByText(/2026-07-08T12:00:00.000Z.*2026-08-07T12:00:00.000Z/)).toBeOnTheScreen();
  expect(screen.getByText('Patterns are descriptive signals from saved analyses, not diagnoses or predictions.')).toBeOnTheScreen();
});

it('retries a failed trend read without hiding the error from assistive technology', async () => {
  const repository = new TrendRepository();
  renderScreen(<TrendsScreen now={() => new Date('2026-08-07T12:00:00.000Z')} />, repository);
  await act(async () => repository.next.reject(new Error('unavailable')));
  expect(await screen.findByRole('alert')).toHaveTextContent('Private trends could not be loaded.');

  repository.next = deferred<TrendSummary>();
  fireEvent.press(screen.getByRole('button', { name: 'Retry loading private trends' }));
  await act(async () => repository.next.resolve({ reportCount: 0, averageIntensity: null, conflictModes: {}, patterns: {} }));
  expect(await screen.findByText('No saved analyses in this window.')).toBeOnTheScreen();
});

it('makes Private Trends discoverable from History', async () => {
  const repository = new TrendRepository();
  renderScreen(<HistoryScreen />, repository);
  fireEvent.press(await screen.findByRole('button', { name: 'View Private Trends' }));
  expect(router.push).toHaveBeenCalledWith('/trends');
});

it('keeps the default trend window stable after the summary rerenders', async () => {
  const repository = new TrendRepository();
  repository.next.resolve({ reportCount: 1, averageIntensity: 20, conflictModes: { Collaborating: 1 }, patterns: { Neutral: 1 } });
  renderScreen(<TrendsScreen />, repository);

  expect(await screen.findByText('1 saved analyses')).toBeOnTheScreen();
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(repository.calls).toHaveLength(1);
});
