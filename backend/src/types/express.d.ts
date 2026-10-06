import type { AuthContext, TenantContext } from '../modules/auth/auth.types.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth`. */
      auth?: AuthContext;
      /** Set by `requireRestaurant`. The only trusted source of a tenant id. */
      tenant?: TenantContext;
    }
  }
}

export {};
