import { Router, type Request } from 'express';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  RestaurantRole,
  StaffPermission,
  UserRole,
  UserStatus,
  createStaffSchema,
  idSchema,
  updateStaffSchema,
  type CreateStaffInput,
  type UpdateStaffInput,
} from '@nayaro/shared';
import { db } from '../../db/client.js';
import { orders, restaurantUsers, users } from '../../db/schema/index.js';
import { requireAuth, requireRestaurant, requireStaff, tenantOf } from '../../http/middleware/auth.js';
import { asyncHandler, validateBody, validateParams, validatedParams } from '../../http/middleware/validate.js';
import { badRequest, conflict, forbidden, notFound } from '../../http/errors.js';
import { created, ok } from '../../http/respond.js';
import { hashPassword } from '../../lib/password.js';
import { revokeAllSessions } from '../auth/auth.service.js';

/**
 * The restaurant's team: managers (with owner-granted permissions) and riders.
 *
 *   owner                   → manage everyone
 *   manager with RIDERS     → manage riders only
 *   anyone else             → nothing here
 */
export const teamRouter: Router = Router();

teamRouter.use(requireAuth, requireRestaurant, requireStaff);

const OPEN_STATUSES = ['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'] as const;

/** Can the caller manage a team member with this restaurant role? */
function canManage(req: Request, role: string): boolean {
  const tenant = req.tenant!;
  if (tenant.isOwner) return true;
  return role === RestaurantRole.RIDER && tenant.permissions.includes(StaffPermission.RIDERS);
}

teamRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const tenant = req.tenant!;
    if (!tenant.isOwner && !tenant.permissions.includes(StaffPermission.RIDERS)) {
      throw forbidden('Only the owner, or a manager allowed to manage riders, can see the team.', 'PERMISSION_DENIED');
    }

    const rows = await db
      .select({
        userId: users.id,
        name: users.name,
        phone: users.phone,
        email: users.email,
        lastLoginAt: users.lastLoginAt,
        role: restaurantUsers.role,
        permissions: restaurantUsers.permissions,
        isActive: restaurantUsers.isActive,
        createdAt: restaurantUsers.createdAt,
      })
      .from(restaurantUsers)
      .innerJoin(users, eq(users.id, restaurantUsers.userId))
      .where(eq(restaurantUsers.restaurantId, restaurantId))
      .orderBy(restaurantUsers.id);

    const riderIds = rows.filter((r) => r.role === RestaurantRole.RIDER).map((r) => r.userId);
    const load = new Map<number, { active: number; delivered: number }>();
    if (riderIds.length > 0) {
      const counts = await db
        .select({
          riderUserId: orders.riderUserId,
          active: sql<number>`sum(${inArray(orders.status, [...OPEN_STATUSES])})`,
          delivered: sql<number>`sum(${orders.status} = 'DELIVERED')`,
        })
        .from(orders)
        .where(and(eq(orders.restaurantId, restaurantId), inArray(orders.riderUserId, riderIds)))
        .groupBy(orders.riderUserId);
      for (const row of counts) {
        load.set(row.riderUserId!, { active: Number(row.active ?? 0), delivered: Number(row.delivered ?? 0) });
      }
    }

    // A riders-only manager sees riders, not the other managers' permissions.
    const visible = tenant.isOwner ? rows : rows.filter((r) => r.role === RestaurantRole.RIDER);
    ok(
      res,
      visible.map((row) => ({
        ...row,
        isActive: row.isActive === 1,
        permissions: row.role === RestaurantRole.OWNER ? Object.values(StaffPermission) : (row.permissions ?? []),
        ...(row.role === RestaurantRole.RIDER ? load.get(row.userId) ?? { active: 0, delivered: 0 } : {}),
      })),
    );
  }),
);

teamRouter.post(
  '/',
  validateBody(createStaffSchema),
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const input = req.body as CreateStaffInput;
    if (!canManage(req, input.role)) {
      throw forbidden(input.role === 'MANAGER' ? 'Only the owner can add managers.' : 'You can’t add riders.', 'PERMISSION_DENIED');
    }

    const email = input.email ? input.email : null;
    if (email) {
      const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (taken) throw conflict('Another account already uses that email.', 'EMAIL_TAKEN');
    }
    // Staff sign in by phone, so it must be unique among staff accounts.
    const [phoneTaken] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.phone, input.phone), ne(users.role, UserRole.CUSTOMER)))
      .limit(1);
    if (phoneTaken) throw conflict('That phone number already belongs to a restaurant team member.', 'PHONE_TAKEN');

    const passwordHash = await hashPassword(input.password);
    const userId = await db.transaction(async (tx) => {
      const [userInsert] = await tx.insert(users).values({
        email,
        name: input.name,
        phone: input.phone,
        passwordHash,
        role: input.role === 'RIDER' ? UserRole.RIDER : UserRole.RESTAURANT_ADMIN,
        status: UserStatus.ACTIVE,
      });
      await tx.insert(restaurantUsers).values({
        restaurantId,
        userId: userInsert.insertId,
        role: input.role === 'RIDER' ? RestaurantRole.RIDER : RestaurantRole.MANAGER,
        permissions: input.role === 'MANAGER' ? [...new Set(input.permissions)] : [],
      });
      return userInsert.insertId;
    });

    created(res, { userId, name: input.name, role: input.role });
  }),
);

const memberParam = z.object({ userId: idSchema });

teamRouter.patch(
  '/:userId',
  validateParams(memberParam),
  validateBody(updateStaffSchema),
  asyncHandler(async (req, res) => {
    const restaurantId = tenantOf(req);
    const { userId } = validatedParams<{ userId: number }>(res);
    const input = req.body as UpdateStaffInput;

    const [member] = await db
      .select({ id: restaurantUsers.id, role: restaurantUsers.role })
      .from(restaurantUsers)
      .where(and(eq(restaurantUsers.restaurantId, restaurantId), eq(restaurantUsers.userId, userId)))
      .limit(1);
    if (!member) throw notFound('Team member not found.', 'MEMBER_NOT_FOUND');
    if (member.role === RestaurantRole.OWNER) throw badRequest('The owner’s access can’t be changed here.', 'OWNER_LOCKED');
    if (!canManage(req, member.role)) throw forbidden('You can’t change this team member.', 'PERMISSION_DENIED');
    if (input.permissions !== undefined && !req.tenant!.isOwner) {
      throw forbidden('Only the owner can change permissions.', 'OWNER_ONLY');
    }

    await db.transaction(async (tx) => {
      if (input.permissions !== undefined || input.isActive !== undefined) {
        await tx
          .update(restaurantUsers)
          .set({
            ...(input.permissions !== undefined && member.role !== RestaurantRole.RIDER
              ? { permissions: [...new Set(input.permissions)] }
              : {}),
            ...(input.isActive !== undefined ? { isActive: input.isActive ? 1 : 0 } : {}),
          })
          .where(eq(restaurantUsers.id, member.id));
      }
      const userSet = {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.password !== undefined ? { passwordHash: await hashPassword(input.password) } : {}),
        // A password reset or switch-off ends every existing session.
        ...(input.password !== undefined || input.isActive === false ? { tokenVersion: sql`${users.tokenVersion} + 1` } : {}),
      };
      if (Object.keys(userSet).length > 0) await tx.update(users).set(userSet).where(eq(users.id, userId));
    });
    if (input.password !== undefined || input.isActive === false) await revokeAllSessions(userId);

    ok(res, { userId });
  }),
);
