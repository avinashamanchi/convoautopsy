import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import ResponsesScreen from '../app/(tabs)/responses';
import ResponseScreen from '../app/response/[reportId]';
import { ReportRepositoryProvider, useReportRepository } from '../src/services/reportRepositoryContext';
import type { AnalysisResult } from '../src/domain/analysis';
import type { PreferenceStore, ReportRepository, SavedReport } from '../src/services/reportRepository';
import { AiClientError } from '../src/services/aiClient';

const mockFiles: { uri: string; write: jest.Mock }[] = [];
let mockReportId = 'report-1';
const mockResponseRequest = jest.fn();
const mockGetConsent = jest.fn();
const mockGrantConsent = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (effect: () => void | (() => void)) => jest.requireActual<typeof import('react')>('react').useEffect(effect, [effect]),
  useLocalSearchParams: () => ({ reportId: mockReportId }),
}));

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('../src/services/consentStore', () => {
  const actual = jest.requireActual('../src/services/consentStore');
  return {
    ...actual,
    createConsentStore: jest.fn(() => ({
      getConsent: (...args: unknown[]) => mockGetConsent(...args),
      grantConsent: (...args: unknown[]) => mockGrantConsent(...args),
      getInstallationToken: jest.fn().mockResolvedValue('installation-token'),
    })),
  };
});
jest.mock('../src/services/aiClient', () => {
  const actual = jest.requireActual('../src/services/aiClient');
  return {
    ...actual,
    createResponseClient: jest.fn(() => (...args: unknown[]) => mockResponseRequest(...args)),
  };
});
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  Directory: class {
    uri: string;
    exists = false;
    constructor(...parts: (string | { uri: string })[]) {
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
    constructor(...parts: (string | { uri: string })[]) {
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
  async listPage() { return { items: this.reports.map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt })), nextCursor: null }; }
  async count() { return this.reports.length; }
  async getTrendSummary() { return { reportCount: 0, averageIntensity: null, conflictModes: {}, patterns: {} }; }
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

class DeferredDeleteRepository extends MemoryReportRepository {
  readonly deleteGate = deferred<void>();

  override async deleteAll() {
    await this.deleteGate.promise;
    this.reports = [];
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

function DeleteAllControl() {
  const { repository } = useReportRepository();
  return (
    <Pressable accessibilityRole="button" onPress={() => { void repository.deleteAll(); }}>
      <Text>Delete all test data</Text>
    </Pressable>
  );
}

function renderResponseWithDeleteControl(repository = new MemoryReportRepository()) {
  return {
    repository,
    ...render(
      <ReportRepositoryProvider repository={repository} preferenceStore={preferences}>
        <ResponseScreen />
        <DeleteAllControl />
      </ReportRepositoryProvider>,
    ),
  };
}

async function selectResponseOptions() {
  await screen.findByText('Step 2 of 4: Sender');
  fireEvent.press(screen.getByRole('button', { name: 'Person A' }));
  fireEvent.press(screen.getByRole('button', { name: 'Resolve the conflict' }));
  fireEvent.press(screen.getByRole('button', { name: 'Direct & clear' }));
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
  mockGetConsent.mockResolvedValue(null);
  mockGrantConsent.mockResolvedValue({ version: '2026-08-07', grantedAt: '2026-08-07T12:00:00.000Z', provider: 'Groq' });
  mockResponseRequest.mockResolvedValue({ id: 'reviewed-1', text: 'Could we return to this calmly?', hint: 'Review before sending.' });
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
  expect(screen.getByRole('button', { name: 'Generate on-device drafts' }).props.accessibilityState.disabled).toBe(true);

  fireEvent.press(screen.getByRole('button', { name: 'Person A' }));
  expect(screen.getByText('Step 3 of 4: Goal')).toBeOnTheScreen();
  expect(screen.getByTestId('goal-resolve')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Resolve the conflict' }));
  expect(screen.getByText('Step 4 of 4: Tone')).toBeOnTheScreen();
  expect(screen.getByTestId('tone-deescalating')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Direct & clear' }));
  expect(screen.getByText('Ready to generate')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Generate on-device drafts' }).props.accessibilityState.disabled).toBe(false);

  await pressAndFlush(screen.getByRole('button', { name: 'Generate on-device drafts' }));

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
  await pressAndFlush(screen.getByRole('button', { name: 'Generate on-device drafts' }));
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
  await pressAndFlush(screen.getByRole('button', { name: 'Generate on-device drafts' }));
  await screen.findAllByText('Draft—review before sending');
  await waitFor(() => expect(repository.reports[0].responseDrafts).toHaveLength(3));

  await pressAndFlush(screen.getByRole('button', { name: 'Reset draft choices' }));

  expect(screen.getByText('Step 2 of 4: Sender')).toBeOnTheScreen();
  expect(screen.queryByText('Draft—review before sending')).toBeNull();
  expect(screen.getByRole('button', { name: 'Generate on-device drafts' }).props.accessibilityState.disabled).toBe(true);
});

it('shows a recoverable persistence failure while keeping generated drafts visible', async () => {
  const repository = new MemoryReportRepository();
  repository.saveError = new Error('disk full');
  renderResponse(repository);
  await screen.findByText('Step 2 of 4: Sender');
  fireEvent.press(screen.getByRole('button', { name: 'Person A' }));
  fireEvent.press(screen.getByRole('button', { name: 'Resolve the conflict' }));
  fireEvent.press(screen.getByRole('button', { name: 'Direct & clear' }));
  await pressAndFlush(screen.getByRole('button', { name: 'Generate on-device drafts' }));

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
  fireEvent.press(screen.getByRole('button', { name: 'Generate on-device drafts' }));
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
  fireEvent.press(screen.getByRole('button', { name: 'Generate on-device drafts' }));
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

it('reviews exact redacted text and current consent before the optional AI request', async () => {
  const privateReport = savedReport({
    title: 'Never transmit this title',
    sourceText: 'Never transmit source storage text',
    responseDrafts: [{ id: 'local-existing', text: 'Existing local draft', hint: 'Keep this.' }],
    result: {
      ...result,
      messages: [
        { ...result.messages[0], text: 'Email me at sam@example.com' },
        result.messages[1],
      ],
    },
  });
  renderResponse(new MemoryReportRepository([privateReport]));
  await selectResponseOptions();

  await pressAndFlush(screen.getByRole('button', { name: 'Generate on-device drafts' }));
  expect(mockResponseRequest).not.toHaveBeenCalled();

  fireEvent.press(screen.getByRole('button', { name: 'Review text for one AI draft' }));
  expect(await screen.findByText('Review exact text sent for AI')).toBeOnTheScreen();
  expect(mockGetConsent).not.toHaveBeenCalled();
  expect(mockResponseRequest).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Text sent for Person A message 1: Email me at [EMAIL]')).toBeOnTheScreen();

  fireEvent.press(screen.getByRole('button', { name: 'Confirm exact text' }));
  expect(await screen.findByText('Before AI-assisted response drafting')).toBeOnTheScreen();
  expect(mockGetConsent).toHaveBeenCalledTimes(1);
  expect(mockResponseRequest).not.toHaveBeenCalled();

  fireEvent.press(screen.getByRole('button', { name: 'Agree and continue' }));
  await waitFor(() => expect(mockResponseRequest).toHaveBeenCalledTimes(1));

  const outgoing = mockResponseRequest.mock.calls[0][0];
  expect(outgoing).toEqual({
    sender: 'Person A',
    goal: 'resolve',
    tone: 'direct',
    analysis: {
      ...privateReport.result,
      messages: [
        { ...privateReport.result.messages[0], text: 'Email me at [EMAIL]' },
        privateReport.result.messages[1],
      ],
    },
  });
  expect(JSON.stringify(outgoing)).not.toMatch(/Never transmit|local-existing|Existing local draft/);
});

it('persists one AI-assisted draft without replacing existing drafts', async () => {
  mockGetConsent.mockResolvedValue({ version: '2026-08-07', grantedAt: '2026-08-07T12:00:00.000Z', provider: 'Groq' });
  const existing = { id: 'resolve-direct-1', text: 'Existing local draft', hint: 'Keep this.' };
  const repository = new MemoryReportRepository([savedReport({ responseDrafts: [existing] })]);
  const save = jest.spyOn(repository, 'save');
  renderResponse(repository);
  await selectResponseOptions();

  fireEvent.press(screen.getByRole('button', { name: 'Review text for one AI draft' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Confirm exact text' }));

  await waitFor(() => expect(repository.reports[0].responseDrafts).toHaveLength(2));
  expect(repository.reports[0].responseDrafts[0]).toEqual(existing);
  expect(repository.reports[0].responseDrafts[1]).toEqual(expect.objectContaining({
    id: expect.stringMatching(/^ai-/),
    text: 'Could we return to this calmly?',
  }));
  expect(mockResponseRequest).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.getByText('On-device draft')).toBeOnTheScreen();
  expect(screen.getByText('AI-assisted draft')).toBeOnTheScreen();
  expect((jest.requireMock('expo-clipboard') as { setStringAsync: jest.Mock }).setStringAsync).not.toHaveBeenCalled();
  expect((jest.requireMock('expo-sharing') as { shareAsync: jest.Mock }).shareAsync).not.toHaveBeenCalled();
});

it.each([
  [new AiClientError('RATE_LIMITED', 31), 'AI draft rate limit reached. Try again in 31 seconds.'],
  [new AiClientError('PLAN_LIMIT_REACHED', 60), 'AI draft allowance has been used for this period.'],
  [new AiClientError('SERVICE_BUSY', 10), 'AI drafting is busy right now.'],
  [new AiClientError('DAILY_BUDGET_REACHED', 60), "AI drafting is paused for today's service budget."],
  [new AiClientError('SERVICE_UNAVAILABLE'), 'AI drafting is temporarily unavailable.'],
  [new AiClientError('TIMEOUT'), 'AI drafting timed out.'],
  [new AiClientError('CANCELLED'), 'AI drafting was canceled.'],
  [new AiClientError('OFFLINE'), 'AI drafting needs a network connection.'],
  [new AiClientError('INVALID_RESPONSE'), 'The AI draft response could not be validated.'],
  [new AiClientError('NOT_CONFIGURED'), 'AI drafting is not configured.'],
] as const)('keeps the local option and saved report after a content-free remote failure', async (error, notice) => {
  mockGetConsent.mockResolvedValue({ version: '2026-08-07', grantedAt: '2026-08-07T12:00:00.000Z', provider: 'Groq' });
  mockResponseRequest.mockRejectedValue(error);
  const existing = { id: 'existing', text: 'Saved draft stays', hint: 'Keep this.' };
  const repository = new MemoryReportRepository([savedReport({ responseDrafts: [existing] })]);
  renderResponse(repository);
  await selectResponseOptions();

  fireEvent.press(screen.getByRole('button', { name: 'Review text for one AI draft' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Confirm exact text' }));

  expect(await screen.findByText(notice)).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Generate on-device drafts' }).props.accessibilityState.disabled).toBe(false);
  expect(repository.reports[0].responseDrafts).toEqual([existing]);
});

it('deduplicates confirmation and prevents an unmounted completion from saving', async () => {
  mockGetConsent.mockResolvedValue({ version: '2026-08-07', grantedAt: '2026-08-07T12:00:00.000Z', provider: 'Groq' });
  const pending = deferred<{ id: string; text: string; hint: string }>();
  mockResponseRequest.mockReturnValue(pending.promise);
  const repository = new MemoryReportRepository();
  const view = renderResponse(repository);
  await selectResponseOptions();
  fireEvent.press(screen.getByRole('button', { name: 'Review text for one AI draft' }));
  const confirm = await screen.findByRole('button', { name: 'Confirm exact text' });

  fireEvent.press(confirm);
  fireEvent.press(confirm);
  await waitFor(() => expect(mockResponseRequest).toHaveBeenCalledTimes(1));
  view.unmount();
  await act(async () => { pending.resolve({ id: 'late', text: 'Late draft', hint: 'Do not save.' }); });

  expect(repository.reports[0].responseDrafts).toEqual([]);
});

it('prevents a late remote completion from saving after a report switch', async () => {
  mockGetConsent.mockResolvedValue({ version: '2026-08-07', grantedAt: '2026-08-07T12:00:00.000Z', provider: 'Groq' });
  const pending = deferred<{ id: string; text: string; hint: string }>();
  mockResponseRequest.mockReturnValue(pending.promise);
  const repository = new MemoryReportRepository([
    savedReport(),
    savedReport({ id: 'report-2', title: 'Saturday conversation' }),
  ]);
  const view = renderResponse(repository);
  await selectResponseOptions();
  fireEvent.press(screen.getByRole('button', { name: 'Review text for one AI draft' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Confirm exact text' }));
  await waitFor(() => expect(mockResponseRequest).toHaveBeenCalledTimes(1));

  mockReportId = 'report-2';
  view.rerender(
    <ReportRepositoryProvider repository={repository} preferenceStore={preferences}>
      <ResponseScreen />
    </ReportRepositoryProvider>,
  );
  expect(await screen.findByText('Selected report: Saturday conversation')).toBeOnTheScreen();
  await act(async () => { pending.resolve({ id: 'late', text: 'Late draft', hint: 'Do not save.' }); });

  expect(repository.reports.find(({ id }) => id === 'report-1')?.responseDrafts).toEqual([]);
  expect(repository.reports.find(({ id }) => id === 'report-2')?.responseDrafts).toEqual([]);
});

it('aborts and prevents a stale save when delete-all starts', async () => {
  mockGetConsent.mockResolvedValue({ version: '2026-08-07', grantedAt: '2026-08-07T12:00:00.000Z', provider: 'Groq' });
  const pending = deferred<{ id: string; text: string; hint: string }>();
  let requestSignal: AbortSignal | undefined;
  mockResponseRequest.mockImplementation((_input, signal) => {
    requestSignal = signal;
    return pending.promise;
  });
  const repository = new DeferredDeleteRepository();
  const save = jest.spyOn(repository, 'save');
  renderResponseWithDeleteControl(repository);
  await selectResponseOptions();
  fireEvent.press(screen.getByRole('button', { name: 'Review text for one AI draft' }));
  fireEvent.press(await screen.findByRole('button', { name: 'Confirm exact text' }));
  await waitFor(() => expect(mockResponseRequest).toHaveBeenCalledTimes(1));

  fireEvent.press(screen.getByRole('button', { name: 'Delete all test data' }));
  expect(await screen.findByText('Saved app data is being deleted…')).toBeOnTheScreen();
  expect(requestSignal?.aborted).toBe(true);
  await act(async () => { pending.resolve({ id: 'late', text: 'Late draft', hint: 'Do not save.' }); });
  expect(save).not.toHaveBeenCalled();

  await act(async () => { repository.deleteGate.resolve(); });
});
