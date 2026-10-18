import { and, desc, eq, isNull } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import { emailCodes } from '../../db/schema/index.js';
import { AppError, badRequest, tooManyRequests } from '../../http/errors.js';
import { sendEmail } from '../../lib/email.js';
import { generateNumericCode, hashToken, safeEquals } from '../../lib/tokens.js';
import { codeEmail } from './email-templates.js';

export type CodePurpose = 'SIGNUP' | 'PASSWORD_RESET';

/** Live = not used, not replaced. Expiry is checked separately for a clearer message. */
const live = (email: string, purpose: CodePurpose) =>
  and(
    eq(emailCodes.email, email),
    eq(emailCodes.purpose, purpose),
    isNull(emailCodes.consumedAt),
    isNull(emailCodes.invalidatedAt),
  );

/**
 * Create a code, retire any earlier one for the same email and purpose, and
 * email it. Only the code's SHA-256 hash is stored.
 */
export async function issueCode(params: {
  purpose: CodePurpose;
  email: string;
  payload?: unknown;
  name?: string;
  ip?: string | undefined;
}): Promise<{ expiresAt: Date }> {
  // Cooldown, so the endpoint can't be used to flood someone's inbox.
  const [recent] = await db
    .select({ createdAt: emailCodes.createdAt })
    .from(emailCodes)
    .where(and(eq(emailCodes.email, params.email), eq(emailCodes.purpose, params.purpose)))
    .orderBy(desc(emailCodes.createdAt))
    .limit(1);
  if (recent) {
    const elapsed = (Date.now() - recent.createdAt.getTime()) / 1000;
    if (elapsed < env.OTP_RESEND_COOLDOWN_SECONDS) {
      throw tooManyRequests(
        `Please wait ${Math.ceil(env.OTP_RESEND_COOLDOWN_SECONDS - elapsed)} seconds before asking for another code.`,
        'CODE_COOLDOWN',
      );
    }
  }

  const code = generateNumericCode(env.OTP_LENGTH);
  const expiresAt = new Date(Date.now() + env.OTP_TTL_MINUTES * 60_000);

  const id = await db.transaction(async (tx) => {
    await tx.update(emailCodes).set({ invalidatedAt: new Date() }).where(live(params.email, params.purpose));
    const [inserted] = await tx.insert(emailCodes).values({
      purpose: params.purpose,
      email: params.email,
      codeHash: hashToken(code),
      payload: params.payload ?? null,
      maxAttempts: env.OTP_MAX_ATTEMPTS,
      expiresAt,
      requestIp: params.ip?.slice(0, 45) ?? null,
    });
    return inserted.insertId;
  });

  const message = codeEmail(params.purpose, code, env.OTP_TTL_MINUTES, params.name);
  const result = await sendEmail({ to: params.email, ...message, idempotencyKey: `email-code-${id}` });
  if (!result.ok) {
    // A code nobody received must not count against the cooldown or stay usable.
    await db.update(emailCodes).set({ invalidatedAt: new Date(), createdAt: new Date(0) }).where(eq(emailCodes.id, id));
    throw new AppError(503, 'EMAIL_SEND_FAILED', 'We couldn’t send the email just now. Please try again in a moment.');
  }

  return { expiresAt };
}

/**
 * Check a code. Wrong guesses are counted against the code itself, so a
 * leaked email address can't be brute-forced even across many IPs.
 * Returns the code's stored payload on success and marks it used.
 */
export async function consumeCode(purpose: CodePurpose, email: string, code: string): Promise<{ payload: unknown }> {
  const [row] = await db
    .select()
    .from(emailCodes)
    .where(live(email, purpose))
    .orderBy(desc(emailCodes.createdAt))
    .limit(1);

  if (!row) throw badRequest('That code isn’t valid any more. Ask for a new one.', 'NO_ACTIVE_CODE');
  if (row.expiresAt.getTime() <= Date.now()) throw badRequest('That code has expired. Ask for a new one.', 'CODE_EXPIRED');
  if (row.attempts >= row.maxAttempts) {
    throw tooManyRequests('Too many wrong attempts. Ask for a new code.', 'CODE_ATTEMPTS_EXCEEDED');
  }

  if (!safeEquals(hashToken(code), row.codeHash)) {
    await db.update(emailCodes).set({ attempts: row.attempts + 1 }).where(eq(emailCodes.id, row.id));
    const left = row.maxAttempts - row.attempts - 1;
    throw badRequest(
      left > 0 ? `That code isn’t right. ${left} attempt${left === 1 ? '' : 's'} left.` : 'That code isn’t right. Ask for a new one.',
      'CODE_INCORRECT',
    );
  }

  // Single use: claim it atomically so two simultaneous requests can't both succeed.
  const claimed = await db
    .update(emailCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(emailCodes.id, row.id), isNull(emailCodes.consumedAt)));
  if (claimed[0].affectedRows === 0) throw badRequest('That code has already been used.', 'CODE_USED');

  return { payload: row.payload };
}
