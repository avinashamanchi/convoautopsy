import type { EntitlementStatus } from './contracts';

export type SaveGate = Readonly<
  { allowed: true }
  | { allowed: false; reason: 'FREE_HISTORY_LIMIT' }
>;

export const canSaveReport = (count: number, entitlementStatus: EntitlementStatus): SaveGate => {
  return entitlementStatus === 'pro' || count < 10
    ? { allowed: true }
    : { allowed: false, reason: 'FREE_HISTORY_LIMIT' };
};
