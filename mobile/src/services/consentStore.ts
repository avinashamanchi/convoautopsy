import * as SecureStore from 'expo-secure-store';
import type { PreferenceStore } from './reportRepository';

export const CONSENT_VERSION = '2026-08-02' as const;
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
  createToken = createInstallationToken,
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
      if (results.some((result) => result.status === 'rejected')) throw new SecureStorageUnavailableError();
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
        await secureStore.setItemAsync(INSTALLATION_TOKEN_KEY, token);
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

function createInstallationToken(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const values = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new SecureStorageUnavailableError();
  }
  globalThis.crypto.getRandomValues(values);
  values[6] = (values[6] & 0x0f) | 0x40;
  values[8] = (values[8] & 0x3f) | 0x80;
  const hex = Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
