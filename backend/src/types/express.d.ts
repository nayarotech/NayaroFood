import type { AuthContext, CustomerContext, TenantContext } from '../modules/auth/auth.types.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth`. */
      auth?: AuthContext;
      /** Set by `requireRestaurant`. The only trusted source of a tenant id. */
      tenant?: TenantContext;
      /** Set by `requireCustomer`: the signed-in customer, already checked not blocked. */
      customer?: CustomerContext;
    }
  }
}

export {};
