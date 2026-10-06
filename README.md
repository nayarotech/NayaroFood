# Nayaro Food Delivery

Multi-tenant SaaS food-delivery platform by **Nayaro Tech** — `food-delivery.nayaro.tech`.

Restaurants register themselves, build a menu, configure their own distance-based
delivery zones, verify a WhatsApp number, and receive orders. Nayaro Tech operates
the platform.

## Workspace

```
food-delivery-nayaro/
├─ my-app/           Next.js 16 (App Router) — customer site + both dashboards
├─ backend/          Express 5 + TypeScript + MySQL — all business logic
└─ packages/shared/  enums, zod schemas, money/geo maths, delivery + status engines
```

`packages/shared` is imported by both halves, so a rule such as "a delivery zone's
max distance is exclusive" is defined exactly once.

## Prerequisites

- Node.js >= 20.9 (developed on 24.x)
- pnpm 10.x
- MySQL 8.0+ (developed on 9.5)

## Setup

```bash
pnpm install

# create the databases and an app user
mysql -u root <<'SQL'
CREATE DATABASE IF NOT EXISTS nayaro_food_delivery CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS nayaro_food_delivery_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'nayaro'@'localhost' IDENTIFIED BY 'nayaro_dev_pw';
GRANT ALL PRIVILEGES ON nayaro_food_delivery.* TO 'nayaro'@'localhost';
GRANT ALL PRIVILEGES ON nayaro_food_delivery_test.* TO 'nayaro'@'localhost';
SQL

cp backend/.env.example backend/.env    # then fill in the secrets
pnpm --filter @nayaro/shared build
pnpm db:migrate
```

Generate the JWT secrets with `openssl rand -base64 48`. The API refuses to boot
on a missing or too-short secret rather than failing later in a request.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Runs the web app and the API together |
| `pnpm dev:web` / `pnpm dev:api` | One side only |
| `pnpm test` | Every package's test suite |
| `pnpm typecheck` | Type-checks every package |
| `pnpm db:generate` | Generates a migration from the Drizzle schema |
| `pnpm db:migrate` | Applies pending migrations |
| `pnpm db:seed` | Seeds the Super Admin and demo data |

After changing anything in `packages/shared`, rebuild it (`pnpm --filter @nayaro/shared build`)
or run `pnpm --filter @nayaro/shared dev` to watch.

## Design rules that are not negotiable

**Tenant isolation is enforced in the backend.** `restaurant_id` is resolved from
the authenticated user's `restaurant_users` membership, never from the request
body. There is no query path that reads a tenant-owned table without a tenant
predicate.

**The backend owns all money and distance.** A client sends item ids, quantities,
and delivery coordinates. Prices, line totals, subtotal, distance, the matched
zone and the delivery fee are all recomputed server-side inside the order
transaction. Anything else a client sends is ignored.

**Delivery zone boundaries are half-open: `[min, max)`.** With zones 0-5, 5-10,
10-20: exactly 5.00 km falls in the 5-10 band, and exactly 20.00 km is outside
every zone and cannot be ordered. Overlapping zones are rejected at write time;
if one ever slips through, the lowest fee wins.

**Orders only go to a VERIFIED WhatsApp number.** A failed send is logged in
`notification_logs` and never invalidates the order. WhatsApp is currently off
(`WHATSAPP_ENABLED=false`) and listed as *Upcoming*; while it is off, nobody loses
ranking points for an unverified number. New orders reach restaurants through the
live dashboard (Server-Sent Events, with sound) and browser Web Push.

**Restaurant lifecycle.** `PENDING` → *Verify* → `ACTIVE`. A Super Admin can
*Deactivate* (`INACTIVE`: hidden and no orders, but the owner can still sign in)
or *Block* (`SUSPENDED`: hidden, no orders, owner locked out). Both need a reason,
which the owner sees. Every admin action is written to `audit_logs` and shown
under **Admin → Activity log**.

**Customer orders and tracking.** Customers order without an account (cash on
delivery). Each order gets a platform-wide tracking code (`NY-XXXX-XXXX`);
`/orders/<code>` updates live as the restaurant moves the order along. A customer
can cancel only while the order is still pending, and must give the phone number
the order was placed with.

**Images.** Logos, cover photos and dish photos are uploaded to
`POST /api/v1/restaurant/uploads`. Only real JPG, PNG and WebP files are accepted
(the type is checked from the file's bytes, not its name), up to `UPLOAD_MAX_BYTES`.
Files are stored under `UPLOAD_DIR/restaurants/<id>/`.

**Site content (Admin → Site content).** The homepage hero, photos and sections,
the header links, the footer, and pages such as About, Privacy policy, Terms and
Contact are all edited in the admin and served without a deploy. Homepage and
footer settings live in `platform_settings`; pages live in `site_pages` and are
served at `/<slug>`. Contact-form messages go to `contact_messages` and show up in
the admin inbox. Default pages are created on first boot.

| Env var | Default | Purpose |
|---|---|---|
| `WHATSAPP_ENABLED` | `false` | Turns on WhatsApp verification and order messages |
| `PLATFORM_UTC_OFFSET` | `+05:45` | Defines a "day" in admin reports |

## Theme

The UI uses the nayaro.tech design tokens: accent `#1f5eff`, hover `#1749cc`,
background `#f7f8fa`, surface `#ffffff`, ink `#111726`; Archivo for display and
IBM Plex Sans for body; radii 6 / 10 / 20px.
