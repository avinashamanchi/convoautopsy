import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import UpgradeScreen from '../app/upgrade';
import ResultScreen from '../app/result';
import { BillingProvider } from '../src/billing/BillingProvider';
import { PurchaseCancelledError } from '../src/billing/revenueCatService';
import { canSaveReport } from '../src/billing/saveGate';
import type { BillingService, BillingSnapshot } from '../src/billing/contracts';
import { ReportRepositoryProvider } from '../src/services/reportRepositoryContext';
import type { AnalysisResult } from '../src/domain/analysis';
import type { PreferenceStore, ReportRepository, SavedReport } from '../src/services/reportRepository';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
jest.mock('../src/state/AnalysisSession', () => ({
  useAnalysisSession: jest.fn(),
}));

const { useAnalysisSession } = jest.requireMock('../src/state/AnalysisSession') as { useAnalysisSession: jest.Mock };

const localResult: AnalysisResult = {
  schemaVersion: 1,
  mode: 'local',
  intensityScore: 18,
  conflictMode: 'Collaborating',
  messages: [{ sender: 'Person A', text: 'Can we talk?', pattern: 'Neutral', egoState: 'Adult', possibleInterpretation: 'This may be neutral.' }],
};

const unavailable: BillingSnapshot = { availability: 'unavailable', entitlementActive: false, products: [] };
const ready: BillingSnapshot = {
  availability: 'ready',
  entitlementActive: false,
  products: [{ id: 'com.avinashamanchi.convoautopsy.pro.monthly', title: 'Monthly', localizedPrice: 'CA$6.49' }],
};

function createBillingService(snapshot: BillingSnapshot, overrides: Partial<BillingService> = {}): BillingService {
  return {
    load: jest.fn().mockResolvedValue(snapshot),
    purchase: jest.fn().mockResolvedValue({ ...snapshot, entitlementActive: true }),
    restore: jest.fn().mockResolvedValue({ ...snapshot, entitlementActive: true }),
    subscribe: jest.fn(() => () => undefined),
    getAppUserId: jest.fn().mockResolvedValue('$RCAnonymousID:test'),
    ...overrides,
  };
}

function renderUpgrade(service: BillingService) {
  return render(<BillingProvider service={service}><UpgradeScreen /></BillingProvider>);
}

function savedReport(index: number): SavedReport {
  return {
    id: `report-${index}`,
    title: `Saved ${index}`,
    createdAt: '2026-08-07T00:00:00.000Z',
    updatedAt: '2026-08-07T00:00:00.000Z',
    sourceText: null,
    result: localResult,
    responseDrafts: [],
  };
}

class MemoryRepository implements ReportRepository {
  public reports: SavedReport[];
  public save = jest.fn(async (report: SavedReport) => { this.reports = [...this.reports, report]; });

  constructor(reports: SavedReport[]) { this.reports = reports; }
  async initialize() {}
  async list() { return [...this.reports]; }
  async get(id: string) { return this.reports.find((report) => report.id === id) ?? null; }
  async delete(id: string) { this.reports = this.reports.filter((report) => report.id !== id); }
  async deleteAll() { this.reports = []; }
}

const preferences: PreferenceStore = {
  get: async () => null, set: async () => {}, delete: async () => {}, deleteAll: async () => {},
};

beforeEach(() => {
  jest.clearAllMocks();
  useAnalysisSession.mockReturnValue({ activeResult: localResult, draft: 'Alex: Can we talk?', reset: jest.fn() });
});

it('keeps Continue Free and Restore Purchases available when products fail to load', async () => {
  renderUpgrade(createBillingService(unavailable));

  expect(await screen.findByRole('button', { name: 'Continue Free' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Restore Purchases' })).toBeTruthy();
  expect(screen.getByText('Purchases are temporarily unavailable.')).toBeTruthy();
});

it('renders only the StoreKit localized price for a purchasable subscription', async () => {
  renderUpgrade(createBillingService(ready));

  expect(await screen.findByRole('button', { name: 'Choose Monthly for CA$6.49' })).toBeTruthy();
  expect(screen.queryByText(/\$4\.99|USD/)).toBeNull();
});

it('keeps the user on the upgrade screen after a cancelled purchase', async () => {
  const service = createBillingService(ready, {
    purchase: jest.fn().mockRejectedValue(new PurchaseCancelledError()),
  });
  renderUpgrade(service);

  fireEvent.press(await screen.findByRole('button', { name: 'Choose Monthly for CA$6.49' }));

  expect(await screen.findByText('Purchase cancelled. You can continue using the free plan.')).toBeTruthy();
  expect(router.back).not.toHaveBeenCalled();
});

it('blocks the eleventh free save without deleting existing reports', async () => {
  expect(canSaveReport(10, false)).toEqual({ allowed: false, reason: 'FREE_HISTORY_LIMIT' });
  expect(canSaveReport(10, true)).toEqual({ allowed: true });

  const repository = new MemoryRepository(Array.from({ length: 10 }, (_, index) => savedReport(index)));
  render(
    <BillingProvider service={createBillingService(unavailable)}>
      <ReportRepositoryProvider preferenceStore={preferences} repository={repository}>
        <ResultScreen createReportId={() => 'new-report'} />
      </ReportRepositoryProvider>
    </BillingProvider>,
  );
  fireEvent.press(await screen.findByRole('button', { name: 'Save analysis' }));
  fireEvent.press(screen.getByRole('button', { name: 'Save privately' }));

  await waitFor(() => expect(router.push).toHaveBeenCalledWith('/upgrade?source=history-limit'));
  expect(repository.save).not.toHaveBeenCalled();
  expect(repository.reports).toHaveLength(10);
});
