import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ZodError } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { DomainError } from '@dentpilot/domain';

const statusByCode: Readonly<Record<string, number>> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  CREATION_REVISION_CONFLICT: 409,
  CREATION_BINDING_REQUIRED: 400,
  SOURCE_INTEGRITY_MISMATCH: 422,
  FORBIDDEN: 403,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_NOT_VERIFIED: 403,
  ACCOUNT_DISABLED: 401,
  SESSION_EXPIRED: 401,
  SESSION_REVOKED: 401,
  RATE_LIMITED: 429,
  INVALID_ACTION_TOKEN: 401,
  ACTION_TOKEN_EXPIRED: 401,
  EMAIL_DELIVERY_UNAVAILABLE: 503,
  AUTH_RATE_LIMIT_UNAVAILABLE: 503,
  INVALID_STATE_TRANSITION: 409,
  MEDIA_VALIDATION_ERROR: 422,
  STORAGE_ERROR: 503,
  GENERATION_ERROR: 422,
  UPLOAD_SESSION_EXPIRED: 409,
  UPLOAD_IN_PROGRESS: 409,
  MEDIA_EMPTY: 422,
  MEDIA_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_FORMAT: 422,
  MEDIA_DECODE_FAILED: 422,
  MEDIA_DIMENSIONS_INVALID: 422,
  MEDIA_PIXEL_LIMIT_EXCEEDED: 422,
  TEMP_STORAGE_FAILED: 503,
  STORAGE_WRITE_FAILED: 503,
  UPLOAD_PROCESSING_TIMEOUT: 409,
  PERSISTENCE_FAILED: 503,
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<FastifyReply>();
    const request = context.getRequest<FastifyRequest>();
    const requestId = request.id;

    if (exception instanceof DomainError) {
      if (exception.code === 'RATE_LIMITED' && exception.details?.retryAfterSeconds) {
        response.header('Retry-After', exception.details.retryAfterSeconds);
      }
      response.status(statusByCode[exception.code] ?? 500).send({
        error: {
          code: exception.code,
          message: exception.safeMessage,
          requestId,
        },
      });
      return;
    }

    if (exception instanceof ZodError) {
      response.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request is not valid.',
          requestId,
        },
      });
      return;
    }

    request.log.error({ err: exception, requestId }, 'Unhandled API exception');
    response.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected server error occurred.',
        requestId,
      },
    });
  }
}
