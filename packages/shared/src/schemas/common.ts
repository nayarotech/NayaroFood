import { z } from 'zod';

/**
 * Primitives shared by every request schema. Validation runs on the backend
 * first; the frontend imports the same schemas so forms reject bad input
 * before a round trip, never *instead* of one.
 */

/** Database ids are BIGINT UNSIGNED, surfaced to JSON as numbers. */
export const idSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens only.');

/**
 * E.164, the only phone format we store. Normalise with `normalisePhone` before
 * validating — users type "098XXXXXXXX", we persist "+97798XXXXXXXX".
 */
export const phoneSchema = z
  .string()
  .trim()
  .min(7, 'Enter a phone number.')
  // Normalise BEFORE validating: people type "9801234567" or "098-1234567"
  // far more often than "+9779801234567", and rejecting those is a UX bug,
  // not a security control. Storage is always E.164.
  .transform((value) => normalisePhone(value))
  .refine(
    (value) => /^\+[1-9]\d{7,14}$/.test(value),
    'Enter a valid phone number, e.g. 9801234567 or +9779801234567.',
  );

export const emailSchema = z.email('Enter a valid email address.').trim().toLowerCase().max(190);

/**
 * Minimum password policy. Length does the heavy lifting; we deliberately do
 * not demand symbol classes, which push people toward weaker, patterned secrets.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(200, 'Password is too long.');

export const latitudeSchema = z.coerce
  .number()
  .min(-90, 'Latitude must be between -90 and 90.')
  .max(90, 'Latitude must be between -90 and 90.');

export const longitudeSchema = z.coerce
  .number()
  .min(-180, 'Longitude must be between -180 and 180.')
  .max(180, 'Longitude must be between -180 and 180.');

export const latLngSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
});
export type LatLngInput = z.infer<typeof latLngSchema>;

/** Money arrives from clients as a major-unit decimal ("250" or "250.50"). */
export const moneyAmountSchema = z.coerce
  .number()
  .min(0, 'Amount cannot be negative.')
  .max(9_999_999, 'Amount is too large.')
  .refine((n) => Number.isInteger(Math.round(n * 100)), 'Use at most 2 decimal places.');

export const distanceKmSchema = z.coerce
  .number()
  .min(0, 'Distance cannot be negative.')
  .max(500, 'Distance must be 500 km or less.')
  .refine((n) => Number.isInteger(Math.round(n * 100)), 'Use at most 2 decimal places.');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

export const sortDirectionSchema = z.enum(['asc', 'desc']).default('desc');

/** Free-text search box. Trimmed, length-capped, empty string means "no filter". */
export const searchSchema = z.string().trim().max(120).optional();

/**
 * Strip everything but digits and a leading +, then apply the default country
 * code. Nepal's `98…`/`97…` mobile numbers are typed locally far more often
 * than in international form.
 */
export function normalisePhone(input: string, defaultCountryCode = '+977'): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  }
  const digits = trimmed.replace(/\D/g, '');
  // A leading 0 is the national trunk prefix and is dropped in E.164.
  const national = digits.replace(/^0+/, '');
  return `${defaultCountryCode}${national}`;
}

/** Mask a phone for display in contexts that should not leak the full number. */
export function maskPhone(e164: string): string {
  if (e164.length <= 6) return e164;
  return `${e164.slice(0, 4)}${'*'.repeat(Math.max(0, e164.length - 7))}${e164.slice(-3)}`;
}

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

/** An image link we will put in an <img src>: http(s) only, never javascript: or data:. */
export const imageUrlSchema = z
  .url({ protocol: /^https?$/, error: 'Enter a valid image link.' })
  .trim()
  .max(500);
