export type PublicErrorCode =
  | 'INVALID_REQUEST'
  | 'CONSENT_REQUIRED'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'PLAN_LIMIT_REACHED'
  | 'SERVICE_BUSY'
  | 'DAILY_BUDGET_REACHED'
  | 'ENTITLEMENT_UNAVAILABLE'
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

export class ProviderUnavailableError extends Error {
  readonly providerFailureKind = 'availability' as const;
}

export class ProviderInvalidResponseError extends Error {
  readonly providerFailureKind = 'invalid_output' as const;
}

export class ProviderRequestRejectedError extends Error {
  readonly providerFailureKind = 'caller' as const;
}

export class ProviderConfigurationError extends Error {
  readonly providerFailureKind = 'configuration' as const;
}

export function asPublicError(error: unknown): PublicError {
  if (error instanceof PublicError) return error;
  if (error instanceof ProviderUnavailableError || (error instanceof DOMException && error.name === 'TimeoutError')) {
    return new PublicError('PROVIDER_UNAVAILABLE', 503);
  }
  if (error instanceof ProviderInvalidResponseError) {
    return new PublicError('PROVIDER_INVALID_RESPONSE', 502);
  }
  if (error instanceof ProviderRequestRejectedError) {
    return new PublicError('PROVIDER_INVALID_RESPONSE', 502);
  }
  if (error instanceof ProviderConfigurationError) {
    return new PublicError('INTERNAL_ERROR', 503, 30);
  }
  return new PublicError('INTERNAL_ERROR', 500);
}
