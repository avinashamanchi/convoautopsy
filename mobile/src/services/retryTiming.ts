export function formatRetryDuration(retryAfterSeconds: number | undefined): string | null {
  if (!Number.isSafeInteger(retryAfterSeconds) || (retryAfterSeconds ?? 0) <= 0) return null;
  const seconds = retryAfterSeconds as number;
  if (seconds < 60) return unit(seconds, 'second');
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return unit(minutes, 'minute');
  const hours = Math.ceil(seconds / 3_600);
  if (hours < 24) return unit(hours, 'hour');
  return unit(Math.ceil(seconds / 86_400), 'day');
}

function unit(value: number, label: string): string {
  return `${value} ${label}${value === 1 ? '' : 's'}`;
}
