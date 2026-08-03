import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import SettingsScreen from '../app/(tabs)/settings';
import { ReportRepositoryProvider } from '../src/services/reportRepositoryContext';
import type { PreferenceStore, ReportRepository } from '../src/services/reportRepository';

jest.mock('../src/services/deleteAllAppData', () => ({
  ...jest.requireActual('../src/services/deleteAllAppData'),
  deleteAllAppData: jest.fn(),
}));
import { deleteAllAppData } from '../src/services/deleteAllAppData';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../src/state/AnalysisSession', () => ({
  useAnalysisSession: () => ({ reset: jest.fn() }),
}));

const repository: ReportRepository = {
  initialize: async () => {}, list: async () => [], get: async () => null,
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

function renderSettings() {
  return render(
    <ReportRepositoryProvider repository={repository} preferenceStore={preferences}>
      <SettingsScreen />
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
  fireEvent.press(await screen.findByRole('button', { name: 'Privacy and retention' }));
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('/privacy'));
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
  await waitFor(() => expect(screen.getByText('All ConvoAutopsy data was deleted from this device.')).toBeOnTheScreen());
});

it('allows a retry after a failed outcome and reaches success on the next attempt', async () => {
  mockedDeleteAllAppData.mockResolvedValueOnce({ ok: false, failed: ['cache'] }).mockResolvedValueOnce({ ok: true });
  renderSettings();
  fireEvent.changeText(await screen.findByLabelText('Type DELETE to confirm'), 'DELETE');
  fireEvent.press(screen.getByRole('button', { name: 'Delete all app data' }));
  await screen.findByRole('button', { name: 'Retry deleting app data' });
  fireEvent.press(screen.getByRole('button', { name: 'Retry deleting app data' }));
  await waitFor(() => expect(screen.getByText('All ConvoAutopsy data was deleted from this device.')).toBeOnTheScreen());
  expect(mockedDeleteAllAppData).toHaveBeenCalledTimes(2);
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
