import { z } from 'zod';
import { emailSchema, imageUrlSchema, paginationSchema } from './common.js';

/**
 * Site content the Super Admin edits without a deploy: the homepage, header
 * links, footer, and standalone pages (About, Privacy, Contact …).
 *
 * Every string is length-capped and every link is restricted to a site path
 * or an http(s)/mailto/tel URL, so admin-entered content can never smuggle a
 * `javascript:` link onto the public site.
 */

/** "/about", "#faq", "https://…", "mailto:…", "tel:…" — nothing else. */
export const siteHrefSchema = z
  .string()
  .trim()
  .max(300)
  .refine(
    (v) => /^\/(?!\/)[^\s]*$/.test(v) || /^#[\w-]+$/.test(v) || /^(https?:\/\/|mailto:|tel:)[^\s]+$/i.test(v),
    'Use a site path like /about, or a full https://, mailto: or tel: link.',
  );

const short = (max: number) => z.string().trim().max(max);

export const siteLinkSchema = z.object({
  label: short(40).min(1, 'Give the link a label.'),
  href: siteHrefSchema,
});
export type SiteLink = z.infer<typeof siteLinkSchema>;

export const sitePhotoSchema = z.object({
  url: imageUrlSchema.or(z.string().regex(/^\/images\/[\w./-]+$/)),
  alt: short(160).default(''),
  label: short(40).default(''),
});
export type SitePhoto = z.infer<typeof sitePhotoSchema>;

/* ---------------- homepage ---------------- */

const featureItemSchema = z.object({
  icon: short(8).default(''),
  title: short(80).min(1),
  text: short(300).default(''),
});

/**
 * Homepage sections the admin can add, remove and reorder. A discriminated
 * union so the public page renders each type with its own layout.
 */
export const homeSectionSchema = z.discriminatedUnion('type', [
  z.object({
    id: short(40).min(1),
    type: z.literal('features'),
    title: short(120).default(''),
    subtitle: short(300).default(''),
    items: z.array(featureItemSchema).max(6).default([]),
  }),
  z.object({
    id: short(40).min(1),
    type: z.literal('text'),
    title: short(120).default(''),
    body: short(4000).default(''),
    image: sitePhotoSchema.nullable().default(null),
  }),
  z.object({
    id: short(40).min(1),
    type: z.literal('cta'),
    title: short(120).default(''),
    body: short(400).default(''),
    buttonLabel: short(40).default(''),
    buttonHref: siteHrefSchema.or(z.literal('')).default(''),
  }),
]);
export type HomeSection = z.infer<typeof homeSectionSchema>;

export const homeContentSchema = z.object({
  hero: z.object({
    badge: short(60).default(''),
    titleStart: short(60).default(''),
    titleHighlight: short(40).default(''),
    titleEnd: short(60).default(''),
    subtitle: short(300).default(''),
  }),
  /** First photo is the large one; the rest form the small row (up to 3). */
  photos: z.array(sitePhotoSchema).max(4).default([]),
  heroCaption: z.object({ title: short(80).default(''), body: short(160).default('') }),
  sections: z.array(homeSectionSchema).max(12).default([]),
});
export type HomeContent = z.infer<typeof homeContentSchema>;

/* ---------------- header + footer ---------------- */

export const chromeContentSchema = z.object({
  /** Extra links in the top bar, e.g. About. */
  headerLinks: z.array(siteLinkSchema).max(5).default([]),
  footer: z.object({
    tagline: short(200).default(''),
    columns: z
      .array(z.object({ title: short(40).min(1), links: z.array(siteLinkSchema).max(8).default([]) }))
      .max(4)
      .default([]),
    contact: z.object({
      email: emailSchema.or(z.literal('')).default(''),
      phone: short(30).default(''),
      address: short(200).default(''),
    }),
    social: z.object({
      facebook: z.url({ protocol: /^https$/ }).or(z.literal('')).default(''),
      instagram: z.url({ protocol: /^https$/ }).or(z.literal('')).default(''),
      tiktok: z.url({ protocol: /^https$/ }).or(z.literal('')).default(''),
      youtube: z.url({ protocol: /^https$/ }).or(z.literal('')).default(''),
    }),
    copyright: short(120).default(''),
  }),
});
export type ChromeContent = z.infer<typeof chromeContentSchema>;

/* ---------------- pages ---------------- */

/** Single path segment that doesn't collide with an app route. */
export const RESERVED_PAGE_SLUGS = [
  'admin', 'dashboard', 'login', 'register', 'orders', 'r', 'api', 'uploads', 'images', 'p', '_next',
] as const;

export const pageSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens, e.g. privacy-policy.')
  .refine((v) => !(RESERVED_PAGE_SLUGS as readonly string[]).includes(v), 'That address is used by the app.');

export const sitePageInputSchema = z.object({
  slug: pageSlugSchema,
  title: short(120).min(2, 'Give the page a title.'),
  summary: short(300).default(''),
  /** Lightweight Markdown: # headings, paragraphs, - lists, **bold**, [links](/x). */
  body: z.string().max(40_000).default(''),
  /** Contact pages show the contact details and a message form under the body. */
  showContactForm: z.boolean().default(false),
  isPublished: z.boolean().default(true),
  showInFooter: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});
export type SitePageInput = z.infer<typeof sitePageInputSchema>;
export const sitePageUpdateSchema = sitePageInputSchema.partial();
export type SitePageUpdate = z.infer<typeof sitePageUpdateSchema>;

/* ---------------- contact messages ---------------- */

export const contactMessageSchema = z.object({
  name: short(120).min(2, 'Enter your name.'),
  /** Email or phone — at least one, so we can reply. */
  email: emailSchema.or(z.literal('')).default(''),
  phone: short(30).default(''),
  topic: z.enum(['general', 'order', 'restaurant', 'partnership', 'other']).default('general'),
  message: short(4000).min(10, 'Tell us a little more (at least 10 characters).'),
  /** Honeypot: humans never fill this in. */
  website: z.string().max(200).optional(),
}).refine((v) => Boolean(v.email || v.phone), { error: 'Give an email or a phone number so we can reply.', path: ['email'] });
export type ContactMessageInput = z.infer<typeof contactMessageSchema>;

export const contactListQuerySchema = paginationSchema.extend({
  status: z.enum(['unread', 'all']).default('all'),
});
