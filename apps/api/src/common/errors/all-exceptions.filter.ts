import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';
import type { Request, Response } from 'express';

/** Renders every error as { error: { code, message, details?, requestId } } without leaking internals. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpError');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return;
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();
    const requestId = req.id ? String(req.id) : undefined;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse() as string | Record<string, unknown>;
      if (typeof body === 'string') {
        message = body;
        code = defaultCode(status);
      } else {
        code = (body.code as string) ?? defaultCode(status);
        const m = body.message;
        if (Array.isArray(m)) {
          // class-validator output
          code = 'VALIDATION_FAILED';
          message = 'Request validation failed';
          details = m;
        } else {
          message = (m as string) ?? message;
          details = body.details;
        }
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2025') {
      status = HttpStatus.NOT_FOUND;
      code = 'NOT_FOUND';
      message = 'Resource not found';
    } else {
      this.logger.error({ err: exception, requestId }, 'Unhandled error');
      Sentry.captureException(exception);
    }

    if (status >= 500 && exception instanceof HttpException) {
      Sentry.captureException(exception);
    }
    res.status(status).json({ error: { code, message, ...(details !== undefined ? { details } : {}), requestId } });
  }
}

function defaultCode(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 429:
      return 'RATE_LIMITED';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'ERROR';
  }
}
