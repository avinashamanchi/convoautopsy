import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import HistoryScreen from '../app/(tabs)/history';
import ResponsesScreen from '../app/(tabs)/responses';
import ReportScreen from '../app/report/[id]';
import ResponseScreen from '../app/response/[reportId]';
import { PrimaryButton } from '../src/components/PrimaryButton';
import type { AnalysisResult } from '../src/domain/analysis';
import type { PreferenceStore, ReportRepository, SavedReport } from '../src/services/reportRepository';
import { ReportRepositoryProvider, useReportRepository } from '../src/services/reportRepositoryContext';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useFocusEffect: (effect: () => void | (() => void)) => { require('react').useEffect(effect, [effect]); },
  useLocalSearchParams: () => ({ id: 'report-1', reportId: 'report-1' }),
}));
jest.mock('../src/billing/BillingProvider', () => ({
  useBilling: () => ({ appUserId: '$RCAnonymousID:revision-test', identityStatus: 'ready' }),
}));

const result: AnalysisResult = {
  schemaVersion: 1, mode: 'local', intensityScore: 20, conflictMode: 'Collaborating',
  messages: [{ sender: 'Person A', text: 'Hello', pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: 'This may be neutral.' }],
};
const report: SavedReport = {
  id: 'report-1', title: 'Newly saved report', createdAt: '2026-08-02T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z', sourceText: null, result, responseDrafts: [],
};

class MemoryRepository implements ReportRepository {
  reports: SavedReport[] = [];
  deleteGate: Promise<void> | null = null;
  releaseDelete: (() => void) | null = null;
  async initialize() {}
  async listPage() { return { items: this.reports.map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt })), nextCursor: null }; }
  async count() { return this.reports.length; }
  async getTrendSummary() { return { reportCount: 0, averageIntensity: null, conflictModes: {}, patterns: {} }; }
  async get(id: string) { return this.reports.find((item) => item.id === id) ?? null; }
  async save(next: SavedReport) { this.reports = [next]; }
  async delete(id: string) { this.reports = this.reports.filter((item) => item.id !== id); }
  async deleteAll() {
    if (this.deleteGate) await this.deleteGate;
    this.reports = [];
  }
  deferDelete() {
    this.deleteGate = new Promise<void>((resolve) => { this.releaseDelete = resolve; });
  }
}

const preferences: PreferenceStore = {
  get: async () => null, set: async () => {}, delete: async () => {}, deleteAll: async () => {},
};

function MutationButtons() {
  const { repository } = useReportRepository();
  return (
    <>
      <PrimaryButton label="Test save" onPress={() => { void repository.save(report); }} />
      <PrimaryButton label="Test delete all" onPress={() => { void repository.deleteAll(); }} />
    </>
  );
}

it('refreshes already-mounted History and Responses after a save without remounting', async () => {
  const repository = new MemoryRepository();
  render(
    <ReportRepositoryProvider repository={repository} preferenceStore={preferences}>
      <HistoryScreen />
      <ResponsesScreen />
      <MutationButtons />
    </ReportRepositoryProvider>,
  );
  expect(await screen.findByText('No saved analyses yet.')).toBeOnTheScreen();
  expect(await screen.findByText('Save an analysis first, then choose it here to draft a response.')).toBeOnTheScreen();

  fireEvent.press(screen.getByRole('button', { name: 'Test save' }));

  expect(await screen.findByText('Newly saved report')).toBeOnTheScreen();
  expect(await screen.findByRole('button', { name: 'Draft responses for Newly saved report' })).toBeOnTheScreen();
});

it('clears a mounted report immediately when delete-all starts, before storage finishes', async () => {
  const repository = new MemoryRepository();
  repository.reports = [report];
  repository.deferDelete();
  render(
    <ReportRepositoryProvider repository={repository} preferenceStore={preferences}>
      <ReportScreen />
      <MutationButtons />
    </ReportRepositoryProvider>,
  );
  expect(await screen.findByRole('header', { name: 'Newly saved report' })).toBeOnTheScreen();

  fireEvent.press(screen.getByRole('button', { name: 'Test delete all' }));

  expect(await screen.findByText('Saved app data is being deleted…')).toBeOnTheScreen();
  expect(screen.queryByRole('header', { name: 'Newly saved report' })).toBeNull();
  await act(async () => { repository.releaseDelete?.(); });
  await waitFor(() => expect(screen.getByText('This saved analysis no longer exists.')).toBeOnTheScreen());
});

it('clears restored response drafts immediately when delete-all starts', async () => {
  const repository = new MemoryRepository();
  repository.reports = [{
    ...report,
    responseDrafts: [{ id: 'private-draft', text: 'Private restored draft', hint: 'Private hint' }],
  }];
  repository.deferDelete();
  render(
    <ReportRepositoryProvider repository={repository} preferenceStore={preferences}>
      <ResponseScreen />
      <MutationButtons />
    </ReportRepositoryProvider>,
  );
  expect(await screen.findByText('Private restored draft')).toBeOnTheScreen();

  fireEvent.press(screen.getByRole('button', { name: 'Test delete all' }));

  expect(await screen.findByText('Saved app data is being deleted…')).toBeOnTheScreen();
  expect(screen.queryByText('Private restored draft')).toBeNull();
  await act(async () => { repository.releaseDelete?.(); });
});
