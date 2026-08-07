import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Linking } from 'react-native';
import SettingsScreen from '../app/(tabs)/settings';
import PrivacyScreen from '../app/privacy';
import { deleteAllAppData } from '../src/services/deleteAllAppData';
import { ReportRepositoryProvider } from '../src/services/reportRepositoryContext';
import type { PreferenceStore, ReportRepository } from '../src/services/reportRepository';

jest.mock('../src/services/deleteAllAppData', () => ({
  ...jest.requireActual('../src/services/deleteAllAppData'),
  deleteAllAppData: jest.fn(),
}));

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../src/state/AnalysisSession', () => ({
  useAnalysisSession: () => ({ reset: jest.fn() }),
}));

const repository: ReportRepository = {
  initialize: async () => {}, listPage: async () => ({ items: [], nextCursor: null }), count: async () => 0,
  getTrendSummary: async () => ({ reportCount: 0, averageIntensity: null, conflictModes: {}, patterns: {} }), get: async () => null,
  save: async () => {}, delete: async () => {}, deleteAll: async () => {},
};
const preferences: PreferenceStore = {
  get: async () => null, set: async () => {}, delete: async () => {}, deleteAll: async () => {},
};
const mockedDeleteAllAppData = deleteAllAppData as jest.MockedFunction<typeof deleteAllAppData>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function renderSettings(onDeleteStatusCommit?: (status: string) => void) {
  return render(
    <ReportRepositoryProvider repository={repository} preferenceStore={preferences}>
      <SettingsScreen onDeleteStatusCommit={onDeleteStatusCommit} />
    </ReportRepositoryProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedDeleteAllAppData.mockResolvedValue({ ok: true });
});

it('requires the exact DELETE phrase before enabling the accessible destructive control', async () => {
  renderSettings();

  expect(await screen.findByRole('button', { name: 'Delete all app data' })).toBeDisabled();
  fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'delete');
  expect(screen.getByRole('button', { name: 'Delete all app data' })).toBeDisabled();

  fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
  expect(screen.getByRole('button', { name: 'Delete all app data' })).toBeEnabled();
});

it('keeps a failed deletion visible and offers an accessible retry instead of claiming success', async () => {
  repository.deleteAll = async () => { throw new Error('locked'); };
  mockedDeleteAllAppData.mockResolvedValueOnce({ ok: false, failed: ['reports'] });
  renderSettings();
  await screen.findByRole('button', { name: 'Delete all app data' });
  fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
  fireEvent.press(screen.getByRole('button', { name: 'Delete all app data' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/Could not completely delete your app data/);
  expect(screen.getByRole('button', { name: 'Retry deleting app data' })).toBeOnTheScreen();
  repository.deleteAll = async () => {};
});

it('opens retention and privacy details from settings', async () => {
  renderSettings();
  fireEvent.press(await screen.findByRole('button', { name: 'Privacy, terms, and support' }));
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('/privacy'));
});

it('opens first-party privacy, terms, and support pages from the legal screen', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  render(<PrivacyScreen />);
  fireEvent.press(screen.getByRole('link', { name: 'Open full privacy policy' }));
  fireEvent.press(screen.getByRole('link', { name: 'Open Terms of Use' }));
  fireEvent.press(screen.getByRole('link', { name: 'Open support page' }));
  expect(openURL).toHaveBeenNthCalledWith(1, 'https://avinashamanchi.github.io/convoautopsy/privacy.html');
  expect(openURL).toHaveBeenNthCalledWith(2, 'https://avinashamanchi.github.io/convoautopsy/terms.html');
  expect(openURL).toHaveBeenNthCalledWith(3, 'https://avinashamanchi.github.io/convoautopsy/support.html');
  openURL.mockRestore();
});

it('starts exactly one destructive run when activated rapidly', async () => {
  const pending = deferred<{ ok: true }>();
  mockedDeleteAllAppData.mockReturnValueOnce(pending.promise);
  renderSettings();
  fireEvent.changeText(await screen.findByLabelText('Type DELETE to confirm'), 'DELETE');
  const button = screen.getByRole('button', { name: 'Delete all app data' });
  fireEvent.press(button);
  fireEvent.press(button);
  expect(mockedDeleteAllAppData).toHaveBeenCalledTimes(1);
  pending.resolve({ ok: true });
  await waitFor(() => expect(screen.getByText(/finished its best-effort local deletion/)).toBeOnTheScreen());
});

it('allows a retry after a failed outcome and reaches success on the next attempt', async () => {
  mockedDeleteAllAppData.mockResolvedValueOnce({ ok: false, failed: ['cache'] }).mockResolvedValueOnce({ ok: true });
  renderSettings();
  fireEvent.changeText(await screen.findByLabelText('Type DELETE to confirm'), 'DELETE');
  fireEvent.press(screen.getByRole('button', { name: 'Delete all app data' }));
  await screen.findByRole('button', { name: 'Retry deleting app data' });
  fireEvent.press(screen.getByRole('button', { name: 'Retry deleting app data' }));
  await waitFor(() => expect(screen.getByText(/finished its best-effort local deletion/)).toBeOnTheScreen());
  expect(mockedDeleteAllAppData).toHaveBeenCalledTimes(2);
});

it('explains that local deletion cannot cancel subscriptions or immediately remove external records', async () => {
  renderSettings();

  expect(await screen.findByText(/does not cancel an App Store subscription/)).toBeTruthy();
  expect(screen.getByText(/cannot recall shared or backed-up data/)).toBeTruthy();
  expect(screen.getByText(/short-lived service safety and accounting records/)).toBeTruthy();
});

it('finishes pending cleanup after unmount without a late state update', async () => {
  const pending = deferred<{ ok: true }>();
  mockedDeleteAllAppData.mockReturnValueOnce(pending.promise);
  const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const view = renderSettings();
  fireEvent.changeText(await screen.findByLabelText('Type DELETE to confirm'), 'DELETE');
  fireEvent.press(screen.getByRole('button', { name: 'Delete all app data' }));
  view.unmount();
  pending.resolve({ ok: true });
  await Promise.resolve();
  expect(mockedDeleteAllAppData).toHaveBeenCalledTimes(1);
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
});

it('commits deleting but never a completion status after unmount', async () => {
  const pending = deferred<{ ok: true }>();
  const commits: string[] = [];
  mockedDeleteAllAppData.mockReturnValueOnce(pending.promise);
  const view = renderSettings((status) => commits.push(status));
  fireEvent.changeText(await screen.findByLabelText('Type DELETE to confirm'), 'DELETE');
  fireEvent.press(screen.getByRole('button', { name: 'Delete all app data' }));
  expect(commits).toEqual(['deleting']);
  view.unmount();
  pending.resolve({ ok: true });
  await Promise.resolve();
  expect(commits).toEqual(['deleting']);
});
