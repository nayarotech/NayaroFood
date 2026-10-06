# Deploying the Nayaro Food API on cPanel

This folder is a ready-to-run build of the backend. You do **not** need pnpm,
TypeScript or the rest of the project on the server.

```
server.js          ← the app (startup file)
migrate.js         ← creates / updates the database tables
create-admin.js    ← creates your Super Admin login
drizzle/           ← database migrations used by migrate.js
uploads/           ← restaurant & dish photos are stored here
package.json       ← dependencies for "Run NPM Install"
.env               ← your settings (hidden file — enable "Show Hidden Files")
```

## 1. Domains first (important)

Sign-in uses a secure cookie that must reach **both** the website and the API, so
they must share a parent domain:

| | Example |
|---|---|
| Frontend (Vercel) | `https://food-delivery.nayaro.tech` |
| API (cPanel) | `https://api.food-delivery.nayaro.tech` |
| `COOKIE_DOMAIN` | `.nayaro.tech` |

A `*.vercel.app` address will **not** work for sign-in, because browsers won't
share a cookie between `vercel.app` and your own domain. Add your own domain in
Vercel. Customers can still browse and order without it, but restaurant and
admin dashboards can't sign in.

In cPanel create the API subdomain (e.g. `api.food-delivery.nayaro.tech`) and
make sure it has an SSL certificate (cPanel → SSL/TLS Status → Run AutoSSL).

## 2. Database

1. cPanel → **MySQL Databases** → create a database, e.g. `cpaneluser_food`.
2. Create a user with a strong password; add it to the database with **ALL PRIVILEGES**.
3. Put the three values into `.env` (`DB_NAME`, `DB_USER`, `DB_PASSWORD`). `DB_HOST=localhost`.

## 3. Upload

1. cPanel → **File Manager** → create a folder **outside** `public_html`, e.g. `/home/cpaneluser/nayaro-api`.
2. Upload `backend.zip` into it and **Extract**.
3. Click **Settings → Show Hidden Files** so you can see and edit `.env`.

## 4. Fill in `.env`

Open `.env` and change every line marked `<-- CHANGE`. The JWT and Web Push
keys are already generated for you — leave them as they are, and keep the file
private.

## 5. Create the Node.js app

cPanel → **Setup Node.js App** → **Create Application**:

| Field | Value |
|---|---|
| Node.js version | 20 or newer (22 recommended) |
| Application mode | Production |
| Application root | `nayaro-api` (the folder from step 3) |
| Application URL | your API subdomain |
| Application startup file | `server.js` |

Click **Create**, then **Run NPM Install** and wait for it to finish.

## 6. Create the tables and your admin login

In the same Node.js app screen, use **Run JS script**:

1. Run **`migrate`** — creates all tables. Run it again after every future update.
2. Run **`create-admin`** — creates the Super Admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
3. Delete the `ADMIN_PASSWORD` line from `.env`.

No terminal? These are the same as `npm run migrate` and `npm run create-admin`
from the app's virtual environment (the command is shown at the top of the
Node.js app page).

## 7. Start and check

Click **Restart**. Then open:

```
https://api.food-delivery.nayaro.tech/api/v1/health
```

You should see `{"data":{"status":"ok", …}}`. If not, check `stderr.log` in the
app folder: the API prints exactly which `.env` value is missing or wrong.

## 8. Point Vercel at it

In Vercel → Project → Settings → Environment Variables:

```
NEXT_PUBLIC_API_URL = https://api.food-delivery.nayaro.tech/api/v1
```

Redeploy the frontend.

## Updating later

Upload the new zip over the old folder **but keep your existing `.env` and
`uploads/` folder**, then Run NPM Install → run `migrate` → Restart.

## Notes

- **Live order alerts** use a long-lived connection (Server-Sent Events). Most
  cPanel hosts pass it through fine. If the dashboard shows "Reconnecting…"
  constantly, ask your host to disable response buffering for the app — orders
  still arrive (on refresh and via phone push alerts) either way.
- **Backups:** include the database and the `uploads/` folder.
- Restaurants must re-enable phone alerts once on the live site — alerts are tied
  to each website address.
