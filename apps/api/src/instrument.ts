import * as Sentry from '@sentry/node';
import { env } from './config/env';

// Must be imported before anything else so Sentry can instrument modules.
if (env().SENTRY_DSN) {
  Sentry.init({
    dsn: env().SENTRY_DSN,
    environment: env().NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}
