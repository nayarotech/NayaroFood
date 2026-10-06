import { Router } from 'express';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  chromeContentSchema,
  contactListQuerySchema,
  contactMessageSchema,
  homeContentSchema,
  idSchema,
  pageSlugSchema,
  sitePageInputSchema,
  sitePageUpdateSchema,
  type ChromeContent,
  type ContactMessageInput,
  type HomeContent,
  type SitePageInput,
  type SitePageUpdate,
} from '@nayaro/shared';
import { db } from '../../db/client.js';
import { auditLogs, contactMessages, platformSettings, sitePages } from '../../db/schema/index.js';
import { authOf } from '../../http/middleware/auth.js';
import { publicReadLimiter, limiterFor } from '../../http/middleware/rate-limit.js';
import {
  asyncHandler,
  validateBody,
  validateParams,
  validateQuery,
  validatedParams,
  validatedQuery,
} from '../../http/middleware/validate.js';
import { badRequest, conflict, notFound } from '../../http/errors.js';
import { created, noContent, ok, paginated } from '../../http/respond.js';
import { logger } from '../../config/logger.js';
import { singleImage, storeImage } from '../uploads/uploads.routes.js';
import { DEFAULT_CHROME, DEFAULT_HOME, DEFAULT_PAGES } from './site.defaults.js';

/**
 * Editable site content: homepage, header/footer, standalone pages and the
 * contact inbox. The public half is read-only apart from the contact form;
 * the admin half is mounted inside the Super Admin router.
 */

const HOME_KEY = 'site.home';
const CHROME_KEY = 'site.chrome';

/**
 * Read a JSON setting, falling back to the default when absent or when a
 * stored value no longer parses (e.g. after a schema change) — a bad row
 * must never take the homepage down.
 */
async function readSetting<T>(key: string, schema: z.ZodType<T>, fallback: T): Promise<T> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, key))
    .limit(1);
  if (!row) return fallback;
  const parsed = schema.safeParse(row.value);
  if (!parsed.success) {
    logger.warn({ key, issues: parsed.error.issues.slice(0, 3) }, 'Stored site setting is invalid; using default');
    return fallback;
  }
  return parsed.data;
}

async function writeSetting(key: string, value: unknown, userId: number, description: string): Promise<void> {
  await db
    .insert(platformSettings)
    .values({ key, value, description, updatedByUserId: userId })
    .onDuplicateKeyUpdate({ set: { value, updatedByUserId: userId } });
}

/** Default pages exist from first boot so the footer links never 404. */
export async function ensureDefaultPages(): Promise<void> {
  const [{ count } = { count: 0 }] = await db.select({ count: sql<number>`count(*)` }).from(sitePages);
  if (Number(count) > 0) return;
  for (const page of DEFAULT_PAGES) {
    await db
      .insert(sitePages)
      .values(toPageRow(page))
      .onDuplicateKeyUpdate({ set: { slug: sql`slug` } });
  }
}

function toPageRow(page: SitePageInput) {
  return {
    slug: page.slug,
    title: page.title,
    summary: page.summary,
    body: page.body,
    showContactForm: page.showContactForm ? 1 : 0,
    isPublished: page.isPublished ? 1 : 0,
    showInFooter: page.showInFooter ? 1 : 0,
    sortOrder: page.sortOrder,
  };
}

const pageFromRow = (row: typeof sitePages.$inferSelect) => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  summary: row.summary,
  body: row.body,
  showContactForm: row.showContactForm === 1,
  isPublished: row.isPublished === 1,
  showInFooter: row.showInFooter === 1,
  sortOrder: row.sortOrder,
  updatedAt: row.updatedAt,
});

/* ------------------------------------------------------------------ */
/* Public                                                              */
/* ------------------------------------------------------------------ */

export const publicSiteRouter: Router = Router();

/** Everything the layout needs: homepage, header links, footer, footer pages. */
publicSiteRouter.get(
  '/site',
  publicReadLimiter,
  asyncHandler(async (_req, res) => {
    const [home, chrome, pages] = await Promise.all([
      readSetting(HOME_KEY, homeContentSchema, DEFAULT_HOME),
      readSetting(CHROME_KEY, chromeContentSchema, DEFAULT_CHROME),
      db
        .select({ slug: sitePages.slug, title: sitePages.title })
        .from(sitePages)
        .where(and(eq(sitePages.isPublished, 1), eq(sitePages.showInFooter, 1)))
        .orderBy(asc(sitePages.sortOrder), asc(sitePages.title)),
    ]);
    // Short shared caching: content edits show within a minute everywhere.
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    ok(res, { home, chrome, footerPages: pages });
  }),
);

publicSiteRouter.get(
  '/pages/:slug',
  publicReadLimiter,
  validateParams(z.object({ slug: pageSlugSchema })),
  asyncHandler(async (_req, res) => {
    const { slug } = validatedParams<{ slug: string }>(res);
    const [row] = await db
      .select()
      .from(sitePages)
      .where(and(eq(sitePages.slug, slug), eq(sitePages.isPublished, 1)))
      .limit(1);
    if (!row) throw notFound('Page not found.', 'PAGE_NOT_FOUND');
    const { contact } = (await readSetting(CHROME_KEY, chromeContentSchema, DEFAULT_CHROME)).footer;
    ok(res, { ...pageFromRow(row), contact });
  }),
);

/** Five messages per IP per hour is plenty for a human and useless for a spammer. */
const contactLimiter = limiterFor({ windowMs: 60 * 60_000, limit: 5 });

publicSiteRouter.post(
  '/contact',
  contactLimiter,
  validateBody(contactMessageSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as ContactMessageInput;
    // Honeypot filled → a bot. Pretend success so it learns nothing.
    if (input.website) {
      created(res, { received: true });
      return;
    }
    await db.insert(contactMessages).values({
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      topic: input.topic,
      message: input.message,
      ipAddress: req.ip?.slice(0, 45) ?? null,
    });
    created(res, { received: true });
  }),
);

/* ------------------------------------------------------------------ */
/* Super Admin                                                         */
/* ------------------------------------------------------------------ */

/** Mounted inside adminRouter, so requireAuth + requireSuperAdmin already ran. */
export const adminSiteRouter: Router = Router();

async function audit(req: Parameters<typeof authOf>[0], action: string, entityId: string | null, metadata: unknown) {
  await db.insert(auditLogs).values({
    actorUserId: authOf(req).userId,
    restaurantId: null,
    action,
    entityType: 'site',
    entityId,
    metadata,
    ipAddress: req.ip?.slice(0, 45) ?? null,
  });
}

adminSiteRouter.get(
  '/content',
  asyncHandler(async (_req, res) => {
    const [home, chrome, unread] = await Promise.all([
      readSetting(HOME_KEY, homeContentSchema, DEFAULT_HOME),
      readSetting(CHROME_KEY, chromeContentSchema, DEFAULT_CHROME),
      db.select({ count: sql<number>`count(*)` }).from(contactMessages).where(isNull(contactMessages.readAt)),
    ]);
    ok(res, { home, chrome, unreadMessages: Number(unread[0]?.count ?? 0) });
  }),
);

adminSiteRouter.put(
  '/home',
  validateBody(homeContentSchema),
  asyncHandler(async (req, res) => {
    const home = req.body as HomeContent;
    const ids = home.sections.map((s) => s.id);
    if (new Set(ids).size !== ids.length) throw badRequest('Two sections share the same id.', 'DUPLICATE_SECTION');
    await writeSetting(HOME_KEY, home, authOf(req).userId, 'Homepage hero, photos and sections');
    await audit(req, 'site.home_updated', null, { sections: home.sections.length, photos: home.photos.length });
    ok(res, home);
  }),
);

adminSiteRouter.put(
  '/chrome',
  validateBody(chromeContentSchema),
  asyncHandler(async (req, res) => {
    const chrome = req.body as ChromeContent;
    await writeSetting(CHROME_KEY, chrome, authOf(req).userId, 'Header links and footer');
    await audit(req, 'site.footer_updated', null, { headerLinks: chrome.headerLinks.length, columns: chrome.footer.columns.length });
    ok(res, chrome);
  }),
);

/** Restore the shipped content for one area. */
adminSiteRouter.post(
  '/reset/:area',
  validateParams(z.object({ area: z.enum(['home', 'chrome']) })),
  asyncHandler(async (req, res) => {
    const { area } = validatedParams<{ area: 'home' | 'chrome' }>(res);
    await db.delete(platformSettings).where(eq(platformSettings.key, area === 'home' ? HOME_KEY : CHROME_KEY));
    await audit(req, `site.${area}_reset`, null, null);
    ok(res, area === 'home' ? DEFAULT_HOME : DEFAULT_CHROME);
  }),
);

/* ---- pages ---- */

adminSiteRouter.get(
  '/pages',
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(sitePages).orderBy(asc(sitePages.sortOrder), asc(sitePages.title));
    ok(res, rows.map(pageFromRow));
  }),
);

const pageId = z.object({ id: idSchema });

adminSiteRouter.get(
  '/pages/:id',
  validateParams(pageId),
  asyncHandler(async (_req, res) => {
    const { id } = validatedParams<{ id: number }>(res);
    const [row] = await db.select().from(sitePages).where(eq(sitePages.id, id)).limit(1);
    if (!row) throw notFound('Page not found.', 'PAGE_NOT_FOUND');
    ok(res, pageFromRow(row));
  }),
);

async function assertSlugFree(slug: string, exceptId?: number): Promise<void> {
  const [row] = await db.select({ id: sitePages.id }).from(sitePages).where(eq(sitePages.slug, slug)).limit(1);
  if (row && row.id !== exceptId) throw conflict(`Another page already uses /${slug}.`, 'SLUG_TAKEN');
}

adminSiteRouter.post(
  '/pages',
  validateBody(sitePageInputSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as SitePageInput;
    await assertSlugFree(input.slug);
    const [result] = await db.insert(sitePages).values({ ...toPageRow(input), updatedByUserId: authOf(req).userId });
    await audit(req, 'site.page_created', String(result.insertId), { slug: input.slug, title: input.title });
    const [row] = await db.select().from(sitePages).where(eq(sitePages.id, result.insertId)).limit(1);
    created(res, pageFromRow(row!));
  }),
);

adminSiteRouter.patch(
  '/pages/:id',
  validateParams(pageId),
  validateBody(sitePageUpdateSchema),
  asyncHandler(async (req, res) => {
    const { id } = validatedParams<{ id: number }>(res);
    const input = req.body as SitePageUpdate;
    if (input.slug) await assertSlugFree(input.slug, id);

    const set: Partial<typeof sitePages.$inferInsert> = { updatedByUserId: authOf(req).userId };
    if (input.slug !== undefined) set.slug = input.slug;
    if (input.title !== undefined) set.title = input.title;
    if (input.summary !== undefined) set.summary = input.summary;
    if (input.body !== undefined) set.body = input.body;
    if (input.showContactForm !== undefined) set.showContactForm = input.showContactForm ? 1 : 0;
    if (input.isPublished !== undefined) set.isPublished = input.isPublished ? 1 : 0;
    if (input.showInFooter !== undefined) set.showInFooter = input.showInFooter ? 1 : 0;
    if (input.sortOrder !== undefined) set.sortOrder = input.sortOrder;

    const result = await db.update(sitePages).set(set).where(eq(sitePages.id, id));
    if (result[0].affectedRows === 0) throw notFound('Page not found.', 'PAGE_NOT_FOUND');
    await audit(req, 'site.page_updated', String(id), { fields: Object.keys(input) });
    const [row] = await db.select().from(sitePages).where(eq(sitePages.id, id)).limit(1);
    ok(res, pageFromRow(row!));
  }),
);

adminSiteRouter.delete(
  '/pages/:id',
  validateParams(pageId),
  asyncHandler(async (req, res) => {
    const { id } = validatedParams<{ id: number }>(res);
    const [row] = await db.select({ slug: sitePages.slug }).from(sitePages).where(eq(sitePages.id, id)).limit(1);
    if (!row) throw notFound('Page not found.', 'PAGE_NOT_FOUND');
    await db.delete(sitePages).where(eq(sitePages.id, id));
    await audit(req, 'site.page_deleted', String(id), { slug: row.slug });
    noContent(res);
  }),
);

/* ---- contact inbox ---- */

adminSiteRouter.get(
  '/messages',
  validateQuery(contactListQuerySchema),
  asyncHandler(async (_req, res) => {
    const query = validatedQuery<z.infer<typeof contactListQuerySchema>>(res);
    const where = query.status === 'unread' ? isNull(contactMessages.readAt) : undefined;
    const [[{ count } = { count: 0 }], rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(contactMessages).where(where),
      db
        .select()
        .from(contactMessages)
        .where(where)
        .orderBy(desc(contactMessages.createdAt), desc(contactMessages.id))
        .limit(query.perPage)
        .offset((query.page - 1) * query.perPage),
    ]);
    paginated(res, rows, { page: query.page, perPage: query.perPage, total: Number(count) });
  }),
);

adminSiteRouter.patch(
  '/messages/:id',
  validateParams(pageId),
  validateBody(z.object({ read: z.boolean() })),
  asyncHandler(async (req, res) => {
    const { id } = validatedParams<{ id: number }>(res);
    const { read } = req.body as { read: boolean };
    const result = await db
      .update(contactMessages)
      .set({ readAt: read ? new Date() : null })
      .where(eq(contactMessages.id, id));
    if (result[0].affectedRows === 0) throw notFound('Message not found.', 'MESSAGE_NOT_FOUND');
    ok(res, { id, read });
  }),
);

adminSiteRouter.delete(
  '/messages/:id',
  validateParams(pageId),
  asyncHandler(async (req, res) => {
    const { id } = validatedParams<{ id: number }>(res);
    await db.delete(contactMessages).where(eq(contactMessages.id, id));
    await audit(req, 'site.message_deleted', String(id), null);
    noContent(res);
  }),
);

/* ---- images for site content ---- */

adminSiteRouter.post(
  '/uploads',
  singleImage(),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Choose an image to upload.', 'NO_FILE');
    created(res, await storeImage(req.file.buffer, 'site', 'site'));
  }),
);
