import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Transactional email. Resend in production; the `log` transport prints the
 * message for local development. Never throws — callers decide what a failed
 * send means for the user.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Resend de-duplicates retries with the same key for 24 h. */
  idempotencyKey?: string;
}

export interface EmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  if (env.EMAIL_PROVIDER === 'log') {
    logger.info({ to: message.to, subject: message.subject, text: message.text }, '[email:log] not actually sent');
    return { ok: true, id: `log-${Date.now()}` };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        ...(message.idempotencyKey ? { 'Idempotency-Key': message.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!response.ok) {
      const error = `Resend ${response.status}: ${body.message ?? body.name ?? 'unknown error'}`;
      logger.warn({ to: message.to, status: response.status, error }, 'Email send failed');
      return { ok: false, error };
    }
    return { ok: true, id: body.id };
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    logger.warn({ to: message.to, err: text }, 'Email send threw');
    return { ok: false, error: text };
  }
}

/** Minimal escaping for values interpolated into the HTML templates. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
