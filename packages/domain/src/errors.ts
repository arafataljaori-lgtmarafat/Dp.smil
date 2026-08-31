export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'FORBIDDEN'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_NOT_VERIFIED'
  | 'ACCOUNT_DISABLED'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
  | 'RATE_LIMITED'
  | 'INVALID_ACTION_TOKEN'
  | 'ACTION_TOKEN_EXPIRED'
  | 'EMAIL_DELIVERY_UNAVAILABLE'
  | 'AUTH_RATE_LIMIT_UNAVAILABLE'
  | 'INVALID_STATE_TRANSITION'
  | 'MEDIA_VALIDATION_ERROR'
  | 'STORAGE_ERROR'
  | 'GENERATION_ERROR'
  | 'SOURCE_INTEGRITY_MISMATCH'
  | 'UPLOAD_SESSION_EXPIRED'
  | 'UPLOAD_IN_PROGRESS'
  | 'MEDIA_EMPTY'
  | 'MEDIA_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_FORMAT'
  | 'MEDIA_DECODE_FAILED'
  | 'MEDIA_DIMENSIONS_INVALID'
  | 'MEDIA_PIXEL_LIMIT_EXCEEDED'
  | 'TEMP_STORAGE_FAILED'
  | 'STORAGE_WRITE_FAILED'
  | 'UPLOAD_PROCESSING_TIMEOUT'
  | 'PERSISTENCE_FAILED'
  | 'CREATION_REVISION_CONFLICT'
  | 'CREATION_BINDING_REQUIRED';

export type StorageFailureCode =
  | 'STORAGE_UNAVAILABLE'
  | 'STORAGE_WRITE_FAILED'
  | 'STORAGE_READ_FAILED'
  | 'STORAGE_DELETE_FAILED'
  | 'STORAGE_OBJECT_NOT_FOUND'
  | 'STORAGE_CONFIGURATION_INVALID';

export type GenerationFailureCode =
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_INTEGRITY_MISMATCH'
  | 'PROVIDER_FAILED'
  | 'OUTPUT_INVALID'
  | 'STORAGE_READ_FAILED'
  | 'STORAGE_WRITE_FAILED'
  | 'PERSISTENCE_FAILED'
  | 'INTERNAL_FAILURE';

export abstract class DomainError extends Error {
  public abstract readonly code: ErrorCode;
  public abstract readonly safeMessage: string;

  public constructor(message: string, public readonly details?: Record<string, string>) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError { public readonly code = 'VALIDATION_ERROR' as const; public readonly safeMessage = 'The request is not valid.'; }
export class NotFoundError extends DomainError { public readonly code = 'NOT_FOUND' as const; public readonly safeMessage = 'The requested resource was not found.'; }
export class ConflictError extends DomainError { public readonly code = 'CONFLICT' as const; public readonly safeMessage = 'The request conflicts with current state.'; }
export class IdempotencyConflictError extends DomainError { public readonly code = 'IDEMPOTENCY_CONFLICT' as const; public readonly safeMessage = 'The idempotency key was already used for a different request.'; }
export class CreationRevisionConflictError extends DomainError { public readonly code = 'CREATION_REVISION_CONFLICT' as const; public readonly safeMessage = 'The creation document changed before this save could be applied.'; }
export class CreationBindingRequiredError extends DomainError { public readonly code = 'CREATION_BINDING_REQUIRED' as const; public readonly safeMessage = 'The current creation document requires a binding that was not supplied.'; }
export class ForbiddenError extends DomainError { public readonly code = 'FORBIDDEN' as const; public readonly safeMessage = 'You do not have access to this resource.'; }
export class UnauthenticatedError extends DomainError { public readonly code = 'UNAUTHENTICATED' as const; public readonly safeMessage = 'Authentication is required.'; }
export class InvalidCredentialsError extends DomainError { public readonly code = 'INVALID_CREDENTIALS' as const; public readonly safeMessage = 'The credentials are not valid.'; }
export class AccountNotVerifiedError extends DomainError { public readonly code = 'ACCOUNT_NOT_VERIFIED' as const; public readonly safeMessage = 'The account is not verified.'; }
export class AccountDisabledError extends DomainError { public readonly code = 'ACCOUNT_DISABLED' as const; public readonly safeMessage = 'The account is disabled.'; }
export class SessionExpiredError extends DomainError { public readonly code = 'SESSION_EXPIRED' as const; public readonly safeMessage = 'The session has expired.'; }
export class SessionRevokedError extends DomainError { public readonly code = 'SESSION_REVOKED' as const; public readonly safeMessage = 'The session has been revoked.'; }
export class RateLimitedError extends DomainError { public readonly code = 'RATE_LIMITED' as const; public readonly safeMessage = 'Too many attempts. Please try again later.'; }
export class InvalidActionTokenError extends DomainError { public readonly code = 'INVALID_ACTION_TOKEN' as const; public readonly safeMessage = 'The action token is not valid.'; }
export class ActionTokenExpiredError extends DomainError { public readonly code = 'ACTION_TOKEN_EXPIRED' as const; public readonly safeMessage = 'The action token has expired.'; }
export class EmailDeliveryUnavailableError extends DomainError { public readonly code = 'EMAIL_DELIVERY_UNAVAILABLE' as const; public readonly safeMessage = 'Email delivery is temporarily unavailable. Please try again later.'; }
export class AuthRateLimitUnavailableError extends DomainError { public readonly code = 'AUTH_RATE_LIMIT_UNAVAILABLE' as const; public readonly safeMessage = 'Authentication is temporarily unavailable. Please try again later.'; }
export class InvalidStateTransitionError extends DomainError { public readonly code = 'INVALID_STATE_TRANSITION' as const; public readonly safeMessage = 'This operation is not allowed in the current state.'; }
export class MediaValidationError extends DomainError { public readonly code = 'MEDIA_VALIDATION_ERROR' as const; public readonly safeMessage = 'The uploaded media could not be accepted.'; }

export type MediaIngestFailureCode =
  | 'UPLOAD_SESSION_EXPIRED'
  | 'UPLOAD_IN_PROGRESS'
  | 'MEDIA_EMPTY'
  | 'MEDIA_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_FORMAT'
  | 'MEDIA_DECODE_FAILED'
  | 'MEDIA_DIMENSIONS_INVALID'
  | 'MEDIA_PIXEL_LIMIT_EXCEEDED'
  | 'TEMP_STORAGE_FAILED'
  | 'STORAGE_WRITE_FAILED'
  | 'UPLOAD_PROCESSING_TIMEOUT'
  | 'PERSISTENCE_FAILED';

const ingestSafeMessages: Record<MediaIngestFailureCode, string> = {
  UPLOAD_SESSION_EXPIRED: 'The upload session has expired.',
  UPLOAD_IN_PROGRESS: 'This upload is already being processed.',
  MEDIA_EMPTY: 'The uploaded file is empty.',
  MEDIA_TOO_LARGE: 'The uploaded file exceeds the allowed size.',
  UNSUPPORTED_MEDIA_FORMAT: 'The uploaded file format is not supported.',
  MEDIA_DECODE_FAILED: 'The uploaded image could not be decoded safely.',
  MEDIA_DIMENSIONS_INVALID: 'The uploaded image dimensions are not allowed.',
  MEDIA_PIXEL_LIMIT_EXCEEDED: 'The uploaded image exceeds the pixel limit.',
  TEMP_STORAGE_FAILED: 'The upload could not be staged safely.',
  STORAGE_WRITE_FAILED: 'The uploaded media could not be stored safely.',
  UPLOAD_PROCESSING_TIMEOUT: 'The upload processing did not complete in time.',
  PERSISTENCE_FAILED: 'The upload could not be finalized safely.',
};

export class MediaIngestError extends DomainError {
  public readonly safeMessage: string;

  public constructor(
    public readonly code: MediaIngestFailureCode,
    message: string,
    details?: Record<string, string>,
  ) {
    super(message, details);
    this.safeMessage = ingestSafeMessages[code];
  }
}
export class StorageError extends DomainError {
  public readonly code = 'STORAGE_ERROR' as const;
  public readonly safeMessage = 'The media could not be stored safely.';

  public constructor(
    message: string,
    public readonly failureCode: StorageFailureCode = 'STORAGE_UNAVAILABLE',
    details?: Record<string, string>,
  ) {
    super(message, details);
  }
}
export class GenerationError extends DomainError { public readonly code = 'GENERATION_ERROR' as const; public readonly safeMessage = 'The generation could not be completed.'; }
export class SourceIntegrityMismatchError extends DomainError { public readonly code = 'SOURCE_INTEGRITY_MISMATCH' as const; public readonly safeMessage = 'The generation source failed integrity verification.'; }
