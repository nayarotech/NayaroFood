import { StaffPermission } from '@nayaro/shared';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { requireAuth, requirePermission, requireRestaurant, tenantOf } from '../../http/middleware/auth.js';
import { asyncHandler, validateQuery, validatedQuery } from '../../http/middleware/validate.js';
import { badRequest } from '../../http/errors.js';
import { created } from '../../http/respond.js';

/**
 * Image uploads for restaurant logos, cover photos and dish photos.
 *
 * The file type is decided by its first bytes, never by the name or the
 * Content-Type the browser claims — so an HTML or SVG file renamed to .jpg
 * is refused rather than served back from our origin. Files are written
 * under a per-restaurant folder with a random name, so one tenant can
 * neither guess nor overwrite another's images.
 */
export const uploadsRouter: Router = Router();

uploadsRouter.use(requireAuth, requireRestaurant, requirePermission(StaffPermission.MENU, StaffPermission.SETTINGS));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_MAX_BYTES, files: 1 },
});

/** Magic numbers for the formats we accept. */
function sniffImage(buffer: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  return null;
}

const kindSchema = z.object({ kind: z.enum(['logo', 'cover', 'item']).default('item') });

/**
 * Validate and store one image under `UPLOAD_DIR/<folder>/`, returning its
 * public URL. Shared by the restaurant and the Super Admin upload routes.
 */
export async function storeImage(buffer: Buffer, folder: string, kind: string): Promise<{ url: string; bytes: number }> {
  const extension = sniffImage(buffer);
  if (!extension) throw badRequest('Use a JPG, PNG or WebP image.', 'UNSUPPORTED_IMAGE');

  if (env.UPLOAD_DRIVER !== 'local') {
    // The S3 driver is configured in env but not implemented yet; fail loudly.
    throw badRequest('Image storage is not configured on this server.', 'UPLOAD_DRIVER_UNAVAILABLE');
  }

  const name = `${kind}-${Date.now().toString(36)}-${randomBytes(6).toString('hex')}.${extension}`;
  await mkdir(path.join(env.UPLOAD_DIR, folder), { recursive: true });
  await writeFile(path.join(env.UPLOAD_DIR, folder, name), buffer, { flag: 'wx' });

  const publicBase = env.API_PUBLIC_URL.replace(/\/+$/, '');
  return { url: `${publicBase}/uploads/${folder.split(path.sep).join('/')}/${name}`, bytes: buffer.length };
}

/** Multer + error mapping, reusable by other routers. */
export const singleImage = () => single('file');

/** Turn multer's errors into the API's normal error envelope. */
function single(field: string) {
  const handler = upload.single(field);
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        next(
          error.code === 'LIMIT_FILE_SIZE'
            ? badRequest(`Images must be ${Math.round(env.UPLOAD_MAX_BYTES / 1024 / 1024)} MB or smaller.`, 'FILE_TOO_LARGE')
            : badRequest('Upload one image at a time.', 'UPLOAD_INVALID'),
        );
        return;
      }
      next(error as Error | undefined);
    });
  };
}

uploadsRouter.post(
  '/',
  validateQuery(kindSchema),
  single('file'),
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const { kind } = validatedQuery<z.infer<typeof kindSchema>>(res);
    const file = req.file;
    if (!file) throw badRequest('Choose an image to upload.', 'NO_FILE');

    created(res, await storeImage(file.buffer, path.join('restaurants', String(restaurantId)), kind));
  }),
);
