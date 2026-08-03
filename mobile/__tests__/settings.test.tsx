import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import SettingsScreen from '../app/(tabs)/settings';
import { ReportRepositoryProvider } from '../src/services/reportRepositoryContext';
import type { PreferenceStore, ReportRepository } from '../src/services/reportRepository';

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

function renderSettings() {
  return render(
    <ReportRepositoryProvider repository={repository} preferenceStore={preferences}>
      <SettingsScreen />
    </ReportRepositoryProvider>,
  );
}

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
