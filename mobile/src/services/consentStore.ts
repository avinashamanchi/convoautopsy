import * as SecureStore from 'expo-secure-store';
import type { PreferenceStore } from './reportRepository';
import { createNativeUuid } from './uuid';

export const CONSENT_VERSION = '2026-08-07.2' as const;
export const SECURE_STORAGE_UNAVAILABLE_MESSAGE = 'Secure device storage is unavailable. On-device analysis still works.';

const CONSENT_KEY = 'convoautopsy.ai-consent.v1';
const INSTALLATION_TOKEN_KEY = 'convoautopsy.installation-token.v1';

export type ConsentRecord = {
  version: typeof CONSENT_VERSION;
  grantedAt: string;
  provider: 'Groq';
};

type SecureStorePort = Pick<typeof SecureStore, 'getItemAsync' | 'setItemAsync' | 'deleteItemAsync'>;

export class SecureStorageUnavailableError extends Error {
  constructor() {
    super(SECURE_STORAGE_UNAVAILABLE_MESSAGE);
    this.name = 'SecureStorageUnavailableError';
  }
}

export class ConsentPreferenceUnavailableError extends Error {
  constructor() {
    super('Consent preference storage is unavailable. Please try again.');
    this.name = 'ConsentPreferenceUnavailableError';
  }
}

export type ConsentStore = {
  getConsent(): Promise<ConsentRecord | null>;
  grantConsent(): Promise<ConsentRecord>;
  revokeConsent(): Promise<void>;
  clearInstallationToken(): Promise<void>;
  getInstallationToken(): Promise<string>;
  clearRemoteAnalysisData(): Promise<void>;
};

type ConsentStoreDependencies = {
  preferences: PreferenceStore;
  secureStore?: SecureStorePort;
  now?: () => Date;
  createToken?: () => string;
};

export function createConsentStore({
  preferences,
  secureStore = SecureStore,
  now = () => new Date(),
  createToken = createNativeUuid,
}: ConsentStoreDependencies): ConsentStore {
  return {
    async getConsent() {
      const stored = await preferences.get(CONSENT_KEY);
      if (!stored) return null;
      try {
        const parsed = JSON.parse(stored) as Partial<ConsentRecord>;
        if (
          parsed.version !== CONSENT_VERSION
          || typeof parsed.grantedAt !== 'string'
          || parsed.provider !== 'Groq'
        ) {
          return null;
        }
        return { version: CONSENT_VERSION, grantedAt: parsed.grantedAt, provider: 'Groq' };
      } catch {
        return null;
      }
    },
    async grantConsent() {
      const record: ConsentRecord = {
        version: CONSENT_VERSION,
        grantedAt: now().toISOString(),
        provider: 'Groq',
      };
      await preferences.set(CONSENT_KEY, JSON.stringify(record));
      return record;
    },
    async revokeConsent() {
      const results = await Promise.allSettled([
        preferences.delete(CONSENT_KEY),
        secureStore.deleteItemAsync(INSTALLATION_TOKEN_KEY),
      ]);
      const [preferenceResult, secureStoreResult] = results;
      if (preferenceResult.status === 'rejected' && secureStoreResult.status === 'fulfilled') {
        throw new ConsentPreferenceUnavailableError();
      }
      if (secureStoreResult.status === 'rejected') throw new SecureStorageUnavailableError();
    },
    async clearInstallationToken() {
      try { await secureStore.deleteItemAsync(INSTALLATION_TOKEN_KEY); }
      catch { throw new SecureStorageUnavailableError(); }
    },
    async getInstallationToken() {
      try {
        const current = await secureStore.getItemAsync(INSTALLATION_TOKEN_KEY);
        if (current) return current;
        const token = createToken();
        await secureStore.setItemAsync(INSTALLATION_TOKEN_KEY, token, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
        return token;
      } catch {
        throw new SecureStorageUnavailableError();
      }
    },
    async clearRemoteAnalysisData() {
      await this.revokeConsent();
    },
  };
}
