export type PublicErrorCode =
  | 'INVALID_REQUEST'
  | 'CONSENT_REQUIRED'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'PLAN_LIMIT_REACHED'
  | 'SERVICE_BUSY'
  | 'DAILY_BUDGET_REACHED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_INVALID_RESPONSE'
  | 'INTERNAL_ERROR';

export class PublicError extends Error {
  constructor(
    readonly code: PublicErrorCode,
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}

export class ProviderUnavailableError extends Error {}
export class ProviderInvalidResponseError extends Error {}

export function asPublicError(error: unknown): PublicError {
  if (error instanceof PublicError) return error;
  if (error instanceof ProviderUnavailableError || (error instanceof DOMException && error.name === 'TimeoutError')) {
    return new PublicError('PROVIDER_UNAVAILABLE', 503);
  }
  if (error instanceof ProviderInvalidResponseError) {
    return new PublicError('PROVIDER_INVALID_RESPONSE', 502);
  }
  return new PublicError('INTERNAL_ERROR', 500);
}
