import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import ResponsesScreen from '../app/(tabs)/responses';
import ResponseScreen from '../app/response/[reportId]';
import { ReportRepositoryProvider } from '../src/services/reportRepositoryContext';
import type { AnalysisResult } from '../src/domain/analysis';
import type { PreferenceStore, ReportRepository, SavedReport } from '../src/services/reportRepository';

const mockFiles: Array<{ uri: string; write: jest.Mock }> = [];
let mockReportId = 'report-1';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (effect: () => void | (() => void)) => require('react').useEffect(effect, [effect]),
  useLocalSearchParams: () => ({ reportId: mockReportId }),
}));

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  Directory: class {
    uri: string;
    exists = false;
    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = `${parts.map((part) => typeof part === 'string' ? part : part.uri).join('/').replace(/\/+$/, '')}/`;
    }
    create = jest.fn(() => { this.exists = true; });
  },
  File: class {
    uri: string;
    exists = true;
    write = jest.fn();
    create = jest.fn();
    delete = jest.fn();
    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = parts.length === 1 && typeof parts[0] === 'string'
        ? parts[0]
        : parts.map((part) => typeof part === 'string' ? part : part.uri).join('/').replace(/([^:]\/)\/+/, '$1');
      mockFiles.push(this);
    }
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; });
  return { promise, resolve, reject };
}

class DeferredSaveRepository extends MemoryReportRepository {
  readonly savePayloads: SavedReport[] = [];
  readonly firstSave = deferred<void>();
  readonly retrySave = deferred<void>();
  private readonly pendingSaves = [this.firstSave, this.retrySave];

  override async save(report: SavedReport) {
    this.savePayloads.push(report);
    const pending = this.pendingSaves.shift();
    if (!pending) throw new Error('unexpected save');
    await pending.promise;
    this.reports = [...this.reports.filter((item) => item.id !== report.id), report];
  }
}

class CrossRouteSaveRepository extends MemoryReportRepository {
  readonly saveStarted = deferred<void>();
  readonly saveGate = deferred<void>();
  readonly secondReportReload = deferred<void>();
  private secondReportReads = 0;

  override async get(id: string) {
    if (id === 'report-2') {
      this.secondReportReads += 1;
      if (this.secondReportReads > 1) await this.secondReportReload.promise;
    }
    return super.get(id);
  }

  override async save(report: SavedReport) {
    this.saveStarted.resolve();
    await this.saveGate.promise;
    await super.save(report);
  }
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

async function pressAndFlush(element: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(element);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  mockReportId = 'report-1';
  jest.clearAllMocks();
  mockFiles.splice(0, mockFiles.length);
  (jest.requireMock('expo-clipboard') as { setStringAsync: jest.Mock }).setStringAsync.mockResolvedValue(true);
  (jest.requireMock('expo-sharing') as { isAvailableAsync: jest.Mock }).isAvailableAsync.mockResolvedValue(true);
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

  expect(await screen.findByText('Step 2 of 4: Sender')).toBeOnTheScreen();
  expect(screen.getByTestId('sender-person-a')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Generate drafts' }).props.accessibilityState.disabled).toBe(true);

  fireEvent.press(screen.getByRole('button', { name: 'Person A' }));
  expect(screen.getByText('Step 3 of 4: Goal')).toBeOnTheScreen();
  expect(screen.getByTestId('goal-resolve')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Resolve the conflict' }));
  expect(screen.getByText('Step 4 of 4: Tone')).toBeOnTheScreen();
  expect(screen.getByTestId('tone-deescalating')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Direct & clear' }));
  expect(screen.getByText('Ready to generate')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Generate drafts' }).props.accessibilityState.disabled).toBe(false);

  await pressAndFlush(screen.getByRole('button', { name: 'Generate drafts' }));

  expect(await screen.findAllByText('Draft—review before sending')).toHaveLength(3);
  expect(screen.getByTestId('share-response-0')).toBeOnTheScreen();
  await waitFor(() => expect(repository.reports[0].responseDrafts).toHaveLength(3));
  expect(repository.reports[0].responseDrafts.map((draft) => draft.id)).toEqual([
    'resolve-direct-1', 'resolve-direct-2', 'resolve-direct-3',
  ]);
});

it('copies and shares only after the respective user presses', async () => {
  renderResponse();
  await screen.findByText('Step 2 of 4: Sender');
  fireEvent.press(screen.getByRole('button', { name: 'Person A' }));
  fireEvent.press(screen.getByRole('button', { name: 'Resolve the conflict' }));
  fireEvent.press(screen.getByRole('button', { name: 'Direct & clear' }));
  await pressAndFlush(screen.getByRole('button', { name: 'Generate drafts' }));
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
  const { repository } = renderResponse();
  await screen.findByText('Step 2 of 4: Sender');
  fireEvent.press(screen.getByRole('button', { name: 'Person A' }));
  fireEvent.press(screen.getByRole('button', { name: 'Resolve the conflict' }));
  fireEvent.press(screen.getByRole('button', { name: 'Direct & clear' }));
  await pressAndFlush(screen.getByRole('button', { name: 'Generate drafts' }));
  await screen.findAllByText('Draft—review before sending');
  await waitFor(() => expect(repository.reports[0].responseDrafts).toHaveLength(3));

  await pressAndFlush(screen.getByRole('button', { name: 'Reset draft choices' }));

  expect(screen.getByText('Step 2 of 4: Sender')).toBeOnTheScreen();
  expect(screen.queryByText('Draft—review before sending')).toBeNull();
  expect(screen.getByRole('button', { name: 'Generate drafts' }).props.accessibilityState.disabled).toBe(true);
});

it('shows a recoverable persistence failure while keeping generated drafts visible', async () => {
  const repository = new MemoryReportRepository();
  repository.saveError = new Error('disk full');
  renderResponse(repository);
  await screen.findByText('Step 2 of 4: Sender');
  fireEvent.press(screen.getByRole('button', { name: 'Person A' }));
  fireEvent.press(screen.getByRole('button', { name: 'Resolve the conflict' }));
  fireEvent.press(screen.getByRole('button', { name: 'Direct & clear' }));
  await pressAndFlush(screen.getByRole('button', { name: 'Generate drafts' }));

  expect(await screen.findByText('Could not save these drafts. Please try again.')).toBeOnTheScreen();
  expect(screen.getAllByText('Draft—review before sending')).toHaveLength(3);
  repository.saveError = null;
  fireEvent.press(screen.getByRole('button', { name: 'Retry saving drafts' }));
  await waitFor(() => expect(repository.reports[0].responseDrafts).toHaveLength(3));
});

it('prevents out-of-order choices and exposes each selected wizard choice', async () => {
  renderResponse();

  expect(await screen.findByText('Selected report: Friday conversation')).toBeOnTheScreen();
  expect(screen.queryByText('3. What is your goal?')).toBeNull();
  expect(screen.queryByText('4. What tone fits?')).toBeNull();

  fireEvent.press(screen.getByRole('button', { name: 'Person A' }));
  expect(screen.getByText('Selected sender: Person A')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Person A' }).props.accessibilityState.selected).toBe(true);
  expect(screen.getByText('3. What is your goal?')).toBeOnTheScreen();
  expect(screen.queryByText('4. What tone fits?')).toBeNull();

  fireEvent.press(screen.getByRole('button', { name: 'Resolve the conflict' }));
  expect(screen.getByText('Selected goal: Resolve the conflict')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Resolve the conflict' }).props.accessibilityState.selected).toBe(true);
  expect(screen.getByText('4. What tone fits?')).toBeOnTheScreen();

  fireEvent.press(screen.getByRole('button', { name: 'Direct & clear' }));
  expect(screen.getByText('Selected tone: Direct & clear')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Direct & clear' }).props.accessibilityState.selected).toBe(true);
});

it('keeps the generated save payload stable when a reset is pressed during a failed save', async () => {
  const repository = new DeferredSaveRepository();
  renderResponse(repository);
  await screen.findByText('Step 2 of 4: Sender');
  fireEvent.press(screen.getByRole('button', { name: 'Person A' }));
  fireEvent.press(screen.getByRole('button', { name: 'Resolve the conflict' }));
  fireEvent.press(screen.getByRole('button', { name: 'Direct & clear' }));
  fireEvent.press(screen.getByRole('button', { name: 'Generate drafts' }));
  await screen.findAllByText('Draft—review before sending');
  await waitFor(() => expect(repository.savePayloads).toHaveLength(1));

  expect(screen.getByRole('button', { name: 'Reset draft choices' }).props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: 'Reset draft choices' }));
  expect(screen.getAllByText('Draft—review before sending')).toHaveLength(3);

  await act(async () => { repository.firstSave.reject(new Error('disk full')); });
  expect(await screen.findByText('Could not save these drafts. Please try again.')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Retry saving drafts' }));
  await waitFor(() => expect(repository.savePayloads).toHaveLength(2));
  expect(repository.savePayloads[1].responseDrafts.map((draft) => draft.id)).toEqual([
    'resolve-direct-1', 'resolve-direct-2', 'resolve-direct-3',
  ]);
  await act(async () => { repository.retrySave.resolve(); });
  await waitFor(() => expect(repository.reports[0].responseDrafts).toHaveLength(3));
});

it('restores persisted response drafts when a saved report is reopened', async () => {
  const restored = {
    id: 'restored-1',
    text: 'I would like to continue this calmly.',
    hint: 'Review this restored draft.',
  };
  renderResponse(new MemoryReportRepository([savedReport({ responseDrafts: [restored] })]));

  expect(await screen.findByText(restored.text)).toBeOnTheScreen();
  expect(screen.getByText('Draft—review before sending')).toBeOnTheScreen();
});

it('persists reset semantics so cleared drafts do not return on reopen', async () => {
  const restored = {
    id: 'restored-1',
    text: 'I would like to continue this calmly.',
    hint: 'Review this restored draft.',
  };
  const repository = new MemoryReportRepository([savedReport({ responseDrafts: [restored] })]);
  renderResponse(repository);
  await screen.findByText(restored.text);

  await pressAndFlush(screen.getByRole('button', { name: 'Reset draft choices' }));

  await waitFor(() => expect(repository.reports[0].responseDrafts).toEqual([]));
  expect(screen.queryByText(restored.text)).toBeNull();
});

it('does not let a deferred save for one route overwrite a newly selected report', async () => {
  const repository = new CrossRouteSaveRepository([
    savedReport(),
    savedReport({ id: 'report-2', title: 'Saturday conversation' }),
  ]);
  const view = renderResponse(repository);
  await screen.findByText('Selected report: Friday conversation');
  fireEvent.press(screen.getByRole('button', { name: 'Person A' }));
  fireEvent.press(screen.getByRole('button', { name: 'Resolve the conflict' }));
  fireEvent.press(screen.getByRole('button', { name: 'Direct & clear' }));
  fireEvent.press(screen.getByRole('button', { name: 'Generate drafts' }));
  await repository.saveStarted.promise;

  mockReportId = 'report-2';
  view.rerender(
    <ReportRepositoryProvider repository={repository} preferenceStore={preferences}>
      <ResponseScreen />
    </ReportRepositoryProvider>,
  );
  expect(await screen.findByText('Selected report: Saturday conversation')).toBeOnTheScreen();

  await act(async () => {
    repository.saveGate.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(screen.getByText('Selected report: Saturday conversation')).toBeOnTheScreen();
  expect(screen.queryByText('Selected report: Friday conversation')).toBeNull();

  await act(async () => { repository.secondReportReload.resolve(); });
});
