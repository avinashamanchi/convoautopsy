jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {
  CONSENT_VERSION,
  ConsentPreferenceUnavailableError,
  SecureStorageUnavailableError,
  createConsentStore,
} from '../src/services/consentStore';
import type { PreferenceStore } from '../src/services/reportRepository';

function createPreferences(): PreferenceStore {
  const values = new Map<string, string>();
  return {
    async get(key) { return values.get(key) ?? null; },
    async set(key, value) { values.set(key, value); },
    async delete(key) { values.delete(key); },
    async deleteAll() { values.clear(); },
  };
}

const secureStore = SecureStore as jest.Mocked<typeof SecureStore>;
const crypto = Crypto as jest.Mocked<typeof Crypto>;

beforeEach(() => {
  jest.clearAllMocks();
  crypto.randomUUID.mockReturnValue('d35af7b0-1a44-47c7-a63c-71071fd4ed4d');
});

it('has no consent until the person explicitly agrees', async () => {
  const store = createConsentStore({ preferences: createPreferences() });

  await expect(store.getConsent()).resolves.toBeNull();
});

it('records the current version, provider, and grant time after an explicit agreement', async () => {
  const store = createConsentStore({ preferences: createPreferences() });

  const consent = await store.grantConsent();

  expect(consent).toEqual({
    version: CONSENT_VERSION,
    grantedAt: expect.any(String),
    provider: 'Groq',
  });
});

it('removes consent when it is revoked', async () => {
  const store = createConsentStore({ preferences: createPreferences() });
  await store.grantConsent();

  await store.revokeConsent();

  await expect(store.getConsent()).resolves.toBeNull();
  expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('convoautopsy.installation-token.v1');
});

it('attempts token deletion when consent preference deletion fails and a later remote use gets a new token', async () => {
  const preferences = createPreferences();
  preferences.delete = async () => { throw new Error('locked'); };
  let token: string | null = 'old-token';
  secureStore.getItemAsync.mockImplementation(async () => token);
  secureStore.deleteItemAsync.mockImplementation(async () => { token = null; });
  secureStore.setItemAsync.mockImplementation(async (_key, value) => { token = value; });
  const store = createConsentStore({ preferences, createToken: () => 'new-token' });

  await expect(store.revokeConsent()).rejects.toEqual(new ConsentPreferenceUnavailableError());
  expect(secureStore.deleteItemAsync).toHaveBeenCalled();
  expect(await store.getInstallationToken()).toBe('new-token');
});

it('uses the same secure installation token on later requests', async () => {
  secureStore.getItemAsync.mockResolvedValue(null);
  const store = createConsentStore({
    preferences: createPreferences(),
    createToken: () => '4b479c21-5169-41b5-ba54-3d0c5bdb82ba',
  });

  const first = await store.getInstallationToken();
  secureStore.getItemAsync.mockResolvedValue(first);
  const second = await store.getInstallationToken();

  expect(first).toBe('4b479c21-5169-41b5-ba54-3d0c5bdb82ba');
  expect(second).toBe(first);
});

it('uses the SDK 54 native UUID provider when no test token factory is injected', async () => {
  secureStore.getItemAsync.mockResolvedValue(null);
  secureStore.setItemAsync.mockResolvedValue(undefined);
  const store = createConsentStore({ preferences: createPreferences() });

  await expect(store.getInstallationToken()).resolves.toBe('d35af7b0-1a44-47c7-a63c-71071fd4ed4d');

  expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  expect(secureStore.setItemAsync).toHaveBeenCalledWith(
    'convoautopsy.installation-token.v1',
    'd35af7b0-1a44-47c7-a63c-71071fd4ed4d',
  );
});

it('reports the accessible on-device-only message when secure storage is unavailable', async () => {
  secureStore.getItemAsync.mockRejectedValue(new Error('keychain unavailable'));
  const store = createConsentStore({ preferences: createPreferences() });

  await expect(store.getInstallationToken()).rejects.toEqual(
    new SecureStorageUnavailableError(),
  );
});

it('clears consent and resets the secure token at the delete-all-app-data boundary', async () => {
  let token: string | null = 'a6d8b2f4-2340-40ab-b2ca-4d41f8b4ea33';
  secureStore.getItemAsync.mockImplementation(async () => token);
  secureStore.setItemAsync.mockImplementation(async (_key, value) => { token = value; });
  secureStore.deleteItemAsync.mockImplementation(async () => { token = null; });
  const store = createConsentStore({
    preferences: createPreferences(),
    createToken: () => '4b479c21-5169-41b5-ba54-3d0c5bdb82ba',
  });
  await store.grantConsent();

  await store.clearRemoteAnalysisData();

  await expect(store.getConsent()).resolves.toBeNull();
  await expect(store.getInstallationToken()).resolves.toBe('4b479c21-5169-41b5-ba54-3d0c5bdb82ba');
  expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('convoautopsy.installation-token.v1');
});
