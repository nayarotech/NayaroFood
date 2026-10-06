import { pino } from 'pino';
import { env, isProduction, isTest } from './env.js';

/**
 * Structured logging. Pretty-printed while developing, JSON in production so a
 * log shipper can parse it.
 *
 * The redact list is the important part: secrets and personal data must never
 * reach the log, however a request object gets passed around.
 */
export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.confirmPassword',
      '*.currentPassword',
      '*.newPassword',
      '*.passwordHash',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
      '*.code',
      '*.codeHash',
      '*.otp',
    ],
    censor: '[redacted]',
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
});

export type Logger = typeof logger;
