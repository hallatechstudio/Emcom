import { HttpException, HttpStatus } from '@nestjs/common';

/** Domain error with a stable machine-readable code. Rendered by AllExceptionsFilter. */
export class AppError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

export const Errors = {
  notFound: (what = 'Resource') => new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} not found`),
  forbidden: (message = 'You do not have permission to perform this action', code = 'FORBIDDEN') =>
    new AppError(HttpStatus.FORBIDDEN, code, message),
  unauthorized: (message = 'Authentication required', code = 'UNAUTHORIZED') =>
    new AppError(HttpStatus.UNAUTHORIZED, code, message),
  conflict: (code: string, message: string, details?: unknown) =>
    new AppError(HttpStatus.CONFLICT, code, message, details),
  badRequest: (code: string, message: string, details?: unknown) =>
    new AppError(HttpStatus.BAD_REQUEST, code, message, details),
  tooMany: (message: string, retryAfterSeconds?: number) =>
    new AppError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', message, { retryAfterSeconds }),
  invalidTransition: (from: string, to: string) =>
    new AppError(HttpStatus.CONFLICT, 'INVALID_STATE_TRANSITION', `Cannot change status from ${from} to ${to}`, {
      from,
      to,
    }),
};
