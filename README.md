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

| Command                         | What it does                                  |
| ------------------------------- | --------------------------------------------- |
| `pnpm dev`                      | Runs the web app and the API together         |
| `pnpm dev:web` / `pnpm dev:api` | One side only                                 |
| `pnpm test`                     | Every package's test suite                    |
| `pnpm typecheck`                | Type-checks every package                     |
| `pnpm db:generate`              | Generates a migration from the Drizzle schema |
| `pnpm db:migrate`               | Applies pending migrations                    |
| `pnpm db:seed`                  | Seeds the Super Admin and demo data           |

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
(`WHATSAPP_ENABLED=false`) and listed as _Upcoming_; while it is off, nobody loses
ranking points for an unverified number. New orders reach restaurants through the
live dashboard (Server-Sent Events, with sound) and browser Web Push.

**Restaurant lifecycle.** `PENDING` → _Verify_ → `ACTIVE`. A Super Admin can
_Deactivate_ (`INACTIVE`: hidden and no orders, but the owner can still sign in)
or _Block_ (`SUSPENDED`: hidden, no orders, owner locked out). Both need a reason,
which the owner sees. Every admin action is written to `audit_logs` and shown
under **Admin → Activity log**.

**Accounts and roles.** Customers sign up (phone + email) and must be signed in to
order. Restaurant owners add **managers** with exactly the permissions they choose
(orders, riders, menu, customers, reviews, settings) and **riders**, who sign in by
phone and see only the deliveries assigned to them at `/rider`. Restaurants and riders
can report problem customers (no answer, last-minute cancellation …); a Super Admin
reviews reports under Admin → Customers and can block a customer, which locks their
account and their phone number. Customers rate delivered orders: only the average is
public, comments go to the restaurant.

**Customer orders and tracking.** Orders are cash on delivery. Each order gets a platform-wide tracking code (`NY-XXXX-XXXX`);
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

| Env var               | Default                 | Purpose                                                       |
| --------------------- | ----------------------- | ------------------------------------------------------------- |
| `WHATSAPP_ENABLED`    | `false`                 | Turns on WhatsApp verification and order messages             |
| `PLATFORM_UTC_OFFSET` | `+05:45`                | Defines a "day" in admin reports                              |
| `EMAIL_PROVIDER`      | `log`                   | `resend` in production; `log` prints emails to the server log |
| `RESEND_API_KEY`      | —                       | Resend API key (required when `EMAIL_PROVIDER=resend`)        |
| `EMAIL_FROM`          | `onboarding@resend.dev` | Sender; must be on a domain verified in Resend                |

**Email codes.** Customers confirm their email with a 6-digit code before their
account is created, and anyone with an email can reset a forgotten password with
one. Codes are sent through Resend, expire after 10 minutes, allow 5 wrong tries,
and only their hash is stored.

## Theme

The UI uses the nayaro.tech design tokens: accent `#1f5eff`, hover `#1749cc`,
background `#f7f8fa`, surface `#ffffff`, ink `#111726`; Archivo for display and
IBM Plex Sans for body; radii 6 / 10 / 20px.

## Regression checks

`pnpm lint`, `pnpm typecheck`, and `pnpm test` run without a local database.
Build shared code first after installing: `pnpm --filter @nayaro/shared build`.

Database regression tests use real MySQL transactions and cover concurrent OTP
attempts, single-use codes, refresh-token replay, rider/tenant authorization,
checkout retries, and publishing order status after commit. Point the backend
environment at a dedicated database whose name ends in `_test`, set
`NODE_ENV=test`, run `pnpm db:migrate`, then run
`pnpm --filter @nayaro/api test:integration`. Tests delete their own fixtures.
Never point these tests at a production database. GitHub Actions provisions a
fresh MySQL service and runs these checks on pushes and pull requests.

## Restaurant hours and scheduled ordering

Apply migrations with `pnpm db:migrate` before deploying this version. Migration
`0009` adds hours, scheduling settings, and scheduled-order timestamps. Existing
restaurants retain manual availability until they configure hours; scheduled
ordering starts disabled.

In **Dashboard → Settings → Hours and scheduled orders**, choose an IANA timezone,
weekly periods, holiday dates, and an optional order limit per dispatch slot.
Days without periods are closed. Use `24:00` for a closing time at midnight;
split overnight hours across two calendar days. Holiday dates use the restaurant's
timezone. Manual closure and the accepting-orders switch override hours and stop
both immediate and scheduled checkout.

Customers can choose a 15-minute dispatch slot up to seven days ahead. A slot
means food should be ready to leave the kitchen, not arrive at the customer's
address. The configured preparation time must fit entirely inside opening hours.
The backend revalidates availability and reserves capacity under the restaurant
settings lock. Cancelled and rejected orders release their reserved capacity.

**Orders → Upcoming scheduled** shows future preparation work. Orders enter
**Needs action** when their saved preparation time arrives; the board refreshes
every 30 seconds. Restaurants can accept ahead of time, but cannot start
preparation early. Confirmed dispatch times, preparation times, and timezones
are snapshotted: later settings changes affect new orders, not existing bookings.
Customers see scheduled dispatch on tracking and account pages; riders and order
notifications show it too. Customers retain the existing cancellation policy
(cancellation while pending).

## Menu options and add-ons

Run `pnpm db:migrate` before using this version. Migration `0010` adds optional
configuration to dishes and selection snapshots to order lines. Existing dishes
and browser carts continue to work without options.

In **Dashboard → Menu**, edit a dish and use **Options and add-ons**. Create groups
such as Size, Protein, or Extras. Set minimum/maximum choices to `1 / 1` for a
required single choice, or `0 / 2` for up to two optional extras. Each option has
an additional per-item price and an availability switch. Use a zero additional
price for the default size or an included choice. Dish discounts apply to the
base price; option charges are then added. Menu “from” prices include the
cheapest mandatory available selections.

Customers choose options before adding a dish. Different combinations have
separate quantities in the cart; the same combination merges even if options
were clicked in a different order. Checkout reprices against the live menu and
flags selections that were removed or sold out. The backend accepts option IDs,
rechecks each group's limits against the locked dish, and calculates all prices.
Order lines retain selected group/option names and per-unit additions, so later
menu edits do not change past orders. Selections appear on restaurant, rider,
customer tracking, account-history, and admin order views, and in order alerts.

Limits: ten groups per dish, twenty options per group, and a maximum of fifty
lines per checkout. Existing scheduled-order rules also apply to customized dishes.
