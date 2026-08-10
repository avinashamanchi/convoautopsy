import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { router } from 'expo-router';
import UpgradeScreen from '../app/upgrade';
import ResultScreen from '../app/result';
import TermsScreen from '../app/terms';
import { BillingProvider } from '../src/billing/BillingProvider';
import { PurchaseCancelledError } from '../src/billing/revenueCatService';
import { canSaveReport } from '../src/billing/saveGate';
import type { BillingService, BillingSnapshot } from '../src/billing/contracts';
import { ReportRepositoryProvider } from '../src/services/reportRepositoryContext';
import type { AnalysisResult } from '../src/domain/analysis';
import type { PreferenceStore, ReportRepository, SavedReport } from '../src/services/reportRepository';
import { legalLinks } from '../src/legal/links';

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

const unavailable: BillingSnapshot = { availability: 'unavailable', entitlementStatus: 'free', products: [] };
const ready: BillingSnapshot = {
  availability: 'ready',
  entitlementStatus: 'free',
  products: [{
    id: 'com.avinashamanchi.convoautopsy.pro.monthly',
    title: 'Monthly',
    localizedPrice: 'CA$6.49',
    period: 'monthly',
  } as unknown as BillingSnapshot['products'][number]],
};

function createBillingService(snapshot: BillingSnapshot, overrides: Partial<BillingService> = {}): BillingService {
  return {
    load: jest.fn().mockResolvedValue(snapshot),
    purchase: jest.fn().mockResolvedValue({ ...snapshot, entitlementStatus: 'pro' }),
    restore: jest.fn().mockResolvedValue({ ...snapshot, entitlementStatus: 'pro' }),
    subscribe: jest.fn(() => () => undefined),
    getAppUserId: jest.fn().mockResolvedValue('$RCAnonymousID:test'),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
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
  async listPage() { return { items: this.reports.map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt })), nextCursor: null }; }
  async count() { return this.reports.length; }
  async getTrendSummary() { return { reportCount: 0, averageIntensity: null, conflictModes: {}, patterns: {} }; }
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

  expect(await screen.findByRole('button', { name: 'Choose Monthly for CA$6.49 per month' })).toBeTruthy();
  expect(screen.getByText('CA$6.49 / month')).toBeTruthy();
  expect(screen.queryByText(/\$4\.99|USD/)).toBeNull();
});

it('states the exact Free and Pro local, storage, and remote fair-use allowances', async () => {
  renderUpgrade(createBillingService(ready));

  expect(await screen.findByText('Free')).toBeTruthy();
  expect(screen.getAllByText(/Unlimited on-device analyses and response drafts/)).toHaveLength(2);
  expect(screen.getByText(/Save up to 10 reports/)).toBeTruthy();
  expect(screen.getByText(/3 remote AI analyses and 6 remote AI-assisted drafts per rolling 30 days/)).toBeTruthy();
  expect(screen.getAllByText('Convo Pro')).toHaveLength(2);
  expect(screen.getByText(/Unlimited saved reports/)).toBeTruthy();
  expect(screen.getByText(/75 remote AI analyses and 150 remote AI-assisted drafts per UTC calendar month/)).toBeTruthy();
  expect(screen.getByText(/fair-use limits, are not credits, and do not roll over/)).toBeTruthy();
  expect(screen.queryByText(/Pro-only trends/i)).toBeNull();
});

it('discloses renewal, cancellation, restore, uninstall, and App Store account behavior', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  renderUpgrade(createBillingService(ready));

  expect(await screen.findByText(/Apple ID is charged when you confirm a purchase/)).toBeTruthy();
  expect(screen.getByText(/automatically renews unless canceled at least 24 hours before/)).toBeTruthy();
  expect(screen.getByText(/renewal within 24 hours before the current period ends/)).toBeTruthy();
  expect(screen.getByText(/Manage or cancel in your App Store account settings/)).toBeTruthy();
  expect(screen.getByText(/Uninstalling ConvoAutopsy or deleting app data does not cancel/)).toBeTruthy();
  expect(screen.getByText(/Restore Purchases checks this App Store account/)).toBeTruthy();
  fireEvent.press(screen.getByRole('link', { name: 'Manage Apple subscription' }));
  fireEvent.press(screen.getByRole('link', { name: 'Apple purchase and refund help' }));
  expect(openURL).toHaveBeenNthCalledWith(1, legalLinks.manageSubscriptions);
  expect(openURL).toHaveBeenNthCalledWith(2, legalLinks.purchaseSupport);
  openURL.mockRestore();
});

it('describes Expo Go as preview-only and names the native purchase test builds', async () => {
  renderUpgrade(createBillingService({ availability: 'preview', entitlementStatus: 'unknown', products: [] }));

  expect(await screen.findByText('Expo Go is preview-only for purchases. Use a development, TestFlight, or App Store build to buy or restore Convo Pro.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Continue Free' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Restore Purchases' })).toBeTruthy();
});

it('keeps the user on the upgrade screen after a cancelled purchase', async () => {
  const service = createBillingService(ready, {
    purchase: jest.fn().mockRejectedValue(new PurchaseCancelledError()),
  });
  renderUpgrade(service);

  fireEvent.press(await screen.findByRole('button', { name: 'Choose Monthly for CA$6.49 per month' }));

  expect(await screen.findByText('Purchase cancelled. You can continue using the free plan.')).toBeTruthy();
  expect(router.back).not.toHaveBeenCalled();
});

it('starts only one purchase when the product is pressed twice before billing updates', async () => {
  const pendingPurchase = deferred<BillingSnapshot>();
  const purchase = jest.fn(() => pendingPurchase.promise);
  const service = createBillingService(ready, { purchase });
  renderUpgrade(service);

  const product = await screen.findByRole('button', { name: 'Choose Monthly for CA$6.49 per month' });
  fireEvent.press(product);
  fireEvent.press(product);
  await waitFor(() => expect(purchase).toHaveBeenCalledTimes(1));

  await act(async () => { pendingPurchase.resolve({ ...ready, entitlementStatus: 'pro' }); });
  await waitFor(() => expect(purchase).toHaveBeenCalledTimes(1));
});

it('does not queue a restore when a purchase is already starting', async () => {
  const pendingPurchase = deferred<BillingSnapshot>();
  const purchase = jest.fn(() => pendingPurchase.promise);
  const restore = jest.fn().mockResolvedValue({ ...ready, entitlementStatus: 'pro' });
  renderUpgrade(createBillingService(ready, { purchase, restore }));

  fireEvent.press(await screen.findByRole('button', { name: 'Choose Monthly for CA$6.49 per month' }));
  fireEvent.press(screen.getByRole('button', { name: 'Restore Purchases' }));
  await waitFor(() => expect(purchase).toHaveBeenCalledTimes(1));

  await act(async () => { pendingPurchase.resolve({ ...ready, entitlementStatus: 'pro' }); });
  await waitFor(() => expect(restore).not.toHaveBeenCalled());
});

it('shows an accessible retry and selectable URL when opening Terms fails', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(true);
  render(<TermsScreen />);

  fireEvent.press(screen.getByRole('link', { name: 'Open full Terms of Use' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not open the Terms of Use. Check your connection and try again.');
  expect(screen.getByText('https://avinashamanchi.github.io/convoautopsy/terms.html').props.selectable).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: 'Retry opening Terms of Use' }));
  await waitFor(() => expect(openURL).toHaveBeenCalledTimes(2));
  openURL.mockRestore();
});

it('blocks the eleventh free save without deleting existing reports', async () => {
  expect(canSaveReport(10, 'free')).toEqual({ allowed: false, reason: 'FREE_HISTORY_LIMIT' });
  expect(canSaveReport(10, 'pro')).toEqual({ allowed: true });

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

it.each(['loading', 'unknown'] as const)('uses the conservative Free save cap while billing is %s', async (entitlementStatus) => {
  expect(canSaveReport(0, entitlementStatus)).toEqual({ allowed: true });
  expect(canSaveReport(10, entitlementStatus)).toEqual({ allowed: false, reason: 'FREE_HISTORY_LIMIT' });
  const repository = new MemoryRepository([]);
  const save = jest.spyOn(repository, 'save');
  const count = jest.spyOn(repository, 'count');
  const load = entitlementStatus === 'loading'
    ? jest.fn(() => new Promise<BillingSnapshot>(() => undefined))
    : jest.fn().mockResolvedValue({ ...unavailable, availability: 'preview', entitlementStatus: 'unknown' });
  render(
    <BillingProvider service={createBillingService(unavailable, { load })}>
      <ReportRepositoryProvider preferenceStore={preferences} repository={repository}>
        <ResultScreen createReportId={() => 'new-report'} />
      </ReportRepositoryProvider>
    </BillingProvider>,
  );
  fireEvent.press(await screen.findByRole('button', { name: 'Save analysis' }));
  const saveButton = await screen.findByRole('button', { name: 'Save privately' });
  fireEvent.press(saveButton);

  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(count).toHaveBeenCalledTimes(1);
  expect(repository.reports).toHaveLength(1);
});
