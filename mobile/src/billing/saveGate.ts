export type SaveGate = Readonly<{ allowed: true } | { allowed: false; reason: 'FREE_HISTORY_LIMIT' }>;

export const canSaveReport = (count: number, pro: boolean): SaveGate => (
  pro || count < 10 ? { allowed: true } : { allowed: false, reason: 'FREE_HISTORY_LIMIT' }
);
