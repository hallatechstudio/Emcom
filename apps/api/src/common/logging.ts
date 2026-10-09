import type { Params } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import { env } from '../config/env';

/** Structured JSON logs; secrets and personal data in requests are redacted. */
export function loggerParams(): Params {
  return {
    pinoHttp: {
      level: env().LOG_LEVEL,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.newPassword',
          'req.body.currentPassword',
          'req.body.refreshToken',
          'req.body.code',
          'req.body.token',
          'res.headers["set-cookie"]',
        ],
        censor: '[redacted]',
      },
      // Query strings can contain community codes; log the path only.
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, path: req.url.split('?')[0] }),
      },
      transport: env().NODE_ENV === 'development' ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
      autoLogging: { ignore: (req) => req.url === '/health/live' || req.url === '/metrics' },
    },
  };
}
