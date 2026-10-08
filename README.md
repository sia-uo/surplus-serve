# SurplusServe

**Free local food-surplus sharing between restaurants and verified NGOs in India.**

Restaurants post surplus cooked food. Verified NGOs nearby search, claim (fully or partially) and collect it with a 6-digit pickup OTP. The food is always free. NGOs pay only the packaging cost per serving shown on the listing, directly to the restaurant at pickup (UPI or cash). There are **no in-app payments**, and NGOs are never charged by the platform. The platform is funded by corporate sponsors, optional restaurant premium plans and impact reports.

It is an installable PWA in English, हिन्दी and ગુજરાતી, and runs entirely on the **Cloudflare free tier**.

---

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Deploy to Cloudflare (step by step)](#deploy-to-cloudflare-step-by-step)
- [Local development](#local-development)
- [Demo data (seed)](#demo-data-seed)
- [Tests](#tests)
- [Free-tier budget](#free-tier-budget)
- [Decisions and assumptions](#decisions-and-assumptions)
- [Licence](#licence)

---

## Features

**Restaurants**
- Profile with geocoded address and map pin, phone, FSSAI licence (14 digits), optional UPI ID, and a "hide my name on public pages" option.
- Post listings with title, description, servings, food type (veg / non-veg / Jain), allergen tags, cooked-at, safe-until, pickup window, packaging cost per serving (capped by `PACKAGING_CAP`, default ₹15) and an optional photo (compressed in the browser).
- A **mandatory 5-item food-safety checklist** before posting.
- **Recurring listings** (daily or weekly at a set IST time), posted automatically by the cron job.
- Dashboard: active / claimed / completed / expired / cancelled listings, **verify pickups by OTP**, and rate the NGO.
- Impact page: meals donated, estimated kg saved, estimated CO₂e avoided.
- **Premium** (the admin sets the flag; there is no payment flow): a monthly shareable impact certificate (PNG drawn in the browser), detailed analytics, and a "Zero Waste Partner" badge. Non-premium restaurants see a "Request premium" form, which emails the admin.

**NGOs**
- Profile with geocoded address, phone, registration number, and a registration-certificate upload (R2; PDF/JPG/PNG ≤ 5 MB; type checked by magic bytes). **Claiming is blocked until an admin approves the NGO.**
- Search by typed address/locality or device location. Radius 2/5/10/25 km, food-type and minimum-servings filters, list and map views, sorted by distance. An **urgent** badge appears when safe-until is under 2 hours.
- Claim full or partial servings with a safety acknowledgement. The NGO then gets the 6-digit OTP, the restaurant's contact details and UPI ID, and a Google Maps directions link.
- My claims: upcoming / completed / cancelled (including no-shows); rate the food after pickup.
- Batched email alerts for new listings within the NGO's chosen radius.

**Sponsors (income)**
- Admin-managed sponsors with name, logo (R2), website, city (or `all`), tier and start/end dates.
- Logos appear on the landing page and on the public **city impact page** ("Meals in Vadodara supported by …").
- **Sponsor impact report** for a city and date range: OTP-verified meals, pickups, restaurants, NGOs served, kg and CO₂e estimates, a daily chart, per-restaurant and per-NGO tables. Export as **CSV** or open a **printable page** (Print → Save as PDF).
- Public "Sponsor us" page with a contact form (rate-limited, with a honeypot) that emails the admin.

**Admin**
- Approve or reject NGOs and restaurants (rejection requires a reason, which is emailed), view uploaded certificates, suspend/reinstate accounts, toggle premium.
- View all users, listings and claims. Global and per-city stats.
- Manage sponsors and generate sponsor reports.
- **Immutable audit log** of every OTP-verified pickup (who, what, when, servings). SQLite triggers block every UPDATE and DELETE, and each row carries a SHA-256 hash chained to the previous row. A "Verify hash chain" button re-checks it.

**System rules**
- Listings auto-expire at safe-until (cron every 10 minutes).
- Claims not collected by the end of the pickup window (plus 15 min grace) are recorded as **no-shows**, and their servings are released. **3 no-shows auto-suspend the NGO.**
- NGO **reliability score** = 70% pickup reliability + 30% average restaurant rating. Restaurant **quality score** = Bayesian average of NGO food ratings.
- Emails: welcome, approval/rejection, new nearby listings (digest), claim confirmation with OTP, pickup completed, no-show warning/suspension, premium/sponsor enquiries to the admin.
- Public pages: landing page with live impact counters, how it works, benefits, FAQ, Terms, Privacy, Food Safety Disclaimer ("the platform only connects parties"), sponsor-us and city impact pages.
- Role-based access control on every route. Rate limiting on public, auth, geocoding, upload and contact endpoints.

**PWA**
- Web app manifest (name, short_name, theme/background colours, `standalone`, 192/512 icons plus maskable icons, shortcuts).
- Service worker: precaches the app shell, uses network-first navigation with app-shell and **offline.html** fallbacks, cache-first static assets, and never caches the API.
- A custom **Install app** button using `beforeinstallprompt`, plus **iOS "Add to Home Screen"** instructions.
- Every icon is generated from the Verd & Vine emblem (`web/public/logo.svg`: a serving bowl beneath a vine with leaves and grapes) by `npm run icons`.

## Architecture

```
               ┌──────────────── one Cloudflare Worker ────────────────┐
 browser ───►  │  /api/*  → Hono API (zod validation, JWT cookie auth) │──► D1 (SQLite)
 (PWA)         │  else    → Workers Static Assets (web/dist, SPA)      │──► R2 (uploads)
               │  cron    → expiry, no-shows, recurring, alert digests │──► Resend, Nominatim
               └───────────────────────────────────────────────────────┘
```

- Same origin, so no CORS. Auth is Google OAuth (authorization-code flow) → a **JWT in an httpOnly, Secure, SameSite=Lax cookie** (30 days). State-changing requests from other origins are rejected.
- Maps use **Leaflet + OpenStreetMap tiles**. Geocoding uses **Nominatim** with a proper User-Agent, **results cached in D1** for 90 days, and a global ≥1.1 s spacing between calls. Distance is computed with **Haversine** after an indexed bounding-box pre-filter.
- Email goes through **Resend** with a D1-backed daily quota. Each message has a priority: critical mail (OTP, approvals, no-shows) may use the full limit, normal mail stops 10 short, and bulk alerts stop 30 short.

## Project structure

```
/web          React + Vite + TypeScript + Tailwind v4 PWA
  public/     manifest, sw.js (precache list injected at build), offline.html, icons, logo.svg
  src/i18n/   en.ts (source), hi.ts, gu.ts — TypeScript enforces every key is translated
  src/pages/  public, restaurant/, ngo/, admin/
/api          Hono Worker
  src/routes/ auth, me, restaurant, ngo, listings, public, files, admin
  src/lib/    session, email, geocode, rules (pure lifecycle logic), audit, uploads, ratelimit
  src/cron.ts scheduled jobs
  test/       vitest: routes, cron, rules, geocode, seed (D1 adapter over node:sqlite)
/shared       constants, Haversine, scoring and API types shared by web + api
/migrations   D1 SQL migrations (applied automatically on deploy)
/scripts      seed.sql (demo data, manual only), generate-icons.mjs
wrangler.toml Worker config: D1, R2, assets, crons, vars
```

## Deploy to Cloudflare (step by step)

You need a Cloudflare account (free plan), a Google account and a Resend account.

### 1. D1 database and R2 bucket (done)

Already created in the APAC region, with the schema migrated:

- D1 `surplus-serve`, id `e10f05d9-0132-499c-bad3-f200e270e1fa` (already in `wrangler.toml`)
- R2 `surplus-serve-uploads`

To recreate them on another account: `npx wrangler d1 create surplus-serve` and `npx wrangler r2 bucket create surplus-serve-uploads`, then paste the new `database_id` into `wrangler.toml`.

### 2. Domain and vars

The app is served at **https://ss.siak.me** (`routes` in `wrangler.toml`, `custom_domain = true`). Cloudflare creates the DNS record and TLS certificate on the first deploy, because `siak.me` is a zone on the same account. Don't create a DNS record for `ss` yourself, or the custom domain won't attach.

Non-secret `[vars]` in `wrangler.toml`:
- `APP_URL = "https://ss.siak.me"`: used in links inside emails sent by the cron job.
- `CONTACT_EMAIL`: a real email for OpenStreetMap's Nominatim usage policy. Leave it empty rather than using a placeholder; placeholders get blocked.
- `EMAIL_FROM`: keep `onboarding@resend.dev` until you verify `siak.me` in Resend (see step 4).

### 3. Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create or select a project → **APIs & Services → OAuth consent screen** (Google Auth Platform → Branding). Choose External, set the app name (SurplusServe) and support email, add **`siak.me`** under authorised domains, and add the scopes `openid`, `email` and `profile`. Publish the app, or add test users while testing.
2. **Credentials → Create credentials → OAuth client ID → Web application.**
3. **Authorised JavaScript origins:**
   - `https://ss.siak.me`
   - `http://localhost:8787`
   - `http://localhost:5173`
4. **Authorised redirect URIs:**
   - `https://ss.siak.me/api/auth/google/callback`
   - `http://localhost:8787/api/auth/google/callback`
   - `http://localhost:5173/api/auth/google/callback`
5. Copy the **Client ID** and **Client secret** for step 6.

Sign in at `https://ss.siak.me`. The workers.dev address also stays live as a fallback, but Google sign-in only works there if you add its callback URL too.

### 4. Resend

1. Sign up at [resend.com](https://resend.com) → **API Keys → Create API key** (Sending access). Copy it for step 6.
2. Without a verified domain, Resend only delivers `onboarding@resend.dev` mail to **your own account email**. To email real users, go to **Domains → Add domain**, add the DNS records, and then set `EMAIL_FROM = "SurplusServe <noreply@siak.me>"` in `wrangler.toml`.
3. The free plan allows 100 emails/day, which matches `EMAIL_DAILY_LIMIT = "100"`. Raise it only if your plan allows more.

### 5. Connect the GitHub repo (Workers Builds)

1. Dashboard → **Workers & Pages → Create → Import a repository** → connect GitHub → choose `sia-uo/surplus-serve`.
2. **Project/Worker name:** `surplus-serve`. It must match `name` in `wrangler.toml`.
3. **Production branch:** `main`
4. **Build command:** `npm run build`
5. **Deploy command:** `npm run deploy`
   This runs `wrangler d1 migrations apply DB --remote && wrangler deploy`, so pending migrations are applied on every deploy, and nothing happens if there are none.
6. **Root directory:** `/` (leave empty).
7. Save and deploy. Later pushes to `main` redeploy automatically.

> If the deploy step fails with an authentication or permission error on `d1 migrations apply`, open **Settings → Builds → API token** and make sure the token has **Account → D1 → Edit** (and Workers Scripts Edit) permission.

### 6. Add secrets in the dashboard

**Workers & Pages → surplus-serve → Settings → Variables and Secrets → Add** (type **Secret**):

| Secret | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth client ID from step 3 |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret from step 3 |
| `RESEND_API_KEY` | Resend API key from step 4 |
| `JWT_SECRET` | A long random string, e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `ADMIN_EMAILS` | Comma-separated Google emails that get the admin role, e.g. `you@gmail.com,ops@yourorg.in` |

Secrets are never stored in the repo. Redeploy (or push a commit) after adding them.

### 7. First login

Open https://ss.siak.me and sign in with an email listed in `ADMIN_EMAILS`. You land in **Admin**. Restaurants and NGOs who sign up appear under **Admin → Verifications**.

Cron triggers (`*/10 * * * *` and `30 18 * * *` = midnight IST) are registered automatically from `wrangler.toml`.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars        # fill in values; DEV_LOGIN=true enables email-only sign-in on localhost
npm run db:migrate:local              # create the local D1 schema
npm run db:seed:local                 # optional demo data
npm run dev                           # wrangler dev (API, :8787) + Vite (UI, :5173)
```

Open http://localhost:5173. Vite proxies `/api` to the Worker. With `DEV_LOGIN=true` the login page shows a **dev sign-in box**; sign in as any seeded account (below) or as an email in your `ADMIN_EMAILS`.

To test the production build and service worker locally: `npm run preview` (builds, then serves everything from the Worker at http://localhost:8787).

To trigger the cron job locally: `curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=*/10+*+*+*+*"`.

Other scripts: `npm run typecheck`, `npm test`, `npm run icons` (regenerate PWA icons from `web/public/logo.svg`).

## Demo data (seed)

`scripts/seed.sql` adds **5 restaurants, 3 NGOs (2 approved, 1 pending) and 10 listings around Vadodara, Gujarat**. It is **not** a migration and never runs automatically. Listing times are relative to "now", and re-running replaces the demo accounts.

```bash
npm run db:seed:local     # local
npm run db:seed:remote    # remote — only for a demo/staging database!
```

Demo accounts (sign in through the dev login locally): `spice.garden@`, `royal.thali@` (premium), `annapurna.jain@`, `tandoor.junction@`, `green.leaf@`, `seva.annadan@` (NGO), `roti.bank@` (NGO) and `hope.foundation@` (pending NGO), all `…@demo.surplusserve.in`. On production these addresses can't sign in through Google, so the seed only provides browsable listings there.

## Tests

```bash
npm test
```

75 vitest tests cover:
- **API routes** against the real migration SQL, via a D1-compatible adapter over Node's built-in SQLite: auth and roles, CSRF/origin check, profile validation, listing rules, search radius/sort/filters, claims (partial, over-claim, concurrency guard), OTP verification and lockout, the immutable audit log, ratings, admin flows, reports/CSV, uploads and public endpoints.
- **Distance** (Haversine and the bounding box), **expiry** and listing-status derivation, and **no-show** rules (grace period, release of servings, auto-suspension at 3).
- **Cron jobs** (expiry, no-shows, recurring posting, alert batching), **geocode caching**, and the **seed script**.

The full flow was also smoke-tested end to end in the real Workers runtime (`wrangler dev` with local D1/R2).

## Free-tier budget

- **Worker CPU:** no heavy server libraries (Hono + zod only). Images are compressed and certificates are rendered **in the browser**. Haversine runs only on bounding-box-filtered rows (max 300). Audit-chain verification is capped at 500 rows.
- **D1:** every list query is paginated (`LIMIT pageSize+1`) and indexed. Public counters are edge-cached for 5 minutes. Geocoding is cached for 90 days. A daily job trims old cache and quota rows.
- **Rate limiting** is in isolate memory, so it costs no D1 writes. Hard ceilings (email quota, Nominatim spacing) are kept in D1.
- **Email:** Resend usage stays under the daily cap. Alerts are one digest per NGO per hour, sent in batches of up to 100, and are skipped when the quota is near the limit.
- **Cron:** 2 triggers (the free plan allows 5).

## Decisions and assumptions

These choices were made without further input. Change them freely.

1. **Restaurants also need admin approval** (FSSAI check) before they can post. Changing the name, FSSAI number or registration details sends a profile back for re-review.
2. **Timestamps** are stored as UTC epoch milliseconds. Recurring post times and report date ranges use **IST** (UTC+05:30).
3. **Listing limits:** safe-until is at most **12 hours** after cooking, the pickup window must end before safe-until, and packaging cost is a whole number of rupees, 0 to `PACKAGING_CAP`.
4. **No-shows:** a claim's deadline is the end of the pickup window. A **15-minute grace** period applies before it counts as a no-show. Released servings return to the listing, which stays claimable only if its window is still open; otherwise it expires. Admin reinstatement resets the NGO's no-show count.
5. **OTP:** 6 digits from a CSPRNG, compared in constant time, **5 wrong attempts** lock that claim. The OTP is visible only to the claiming NGO and hidden after completion.
6. **Impact estimates:** **0.4 kg per meal** and **2.5 kg CO₂e avoided per kg** of food not wasted (`shared/constants.ts`). Only OTP-verified pickups count.
7. **Scores:** NGO reliability = 70 × (completed+1)/(completed+no-shows+1) + 30 × (avg rating/5), with a 4★ default. Restaurant quality = Bayesian average (prior 4★ × 3 ratings), scaled to 0–100.
8. **Audit log** rows are append-only (DB triggers) and hash-chained. Two pickups verified at the same millisecond could fork the chain; at this scale that is negligible, and the verifier would flag it.
9. **Google ID token:** it is received directly from Google's token endpoint over TLS, so it is decoded and its claims (aud, iss, exp, email_verified) are checked without re-verifying the signature, per Google's OpenID guidance.
10. **Rate limiting** is per-isolate (approximate) to stay within free D1 write limits.
11. **Sponsor logos** accept PNG/JPG/WebP only. SVG is rejected because of XSS risk on the same origin.
12. **Directions** use a plain Google Maps URL, which needs no API key. Map tiles and geocoding use OpenStreetMap only.
13. **Languages:** all UI text is translated into Hindi and Gujarati. The long legal texts (Terms, Privacy, Disclaimer) are English-only with a translated notice; have them reviewed by a lawyer before launch.
14. **Premium analytics charts** are lightweight CSS bars, so no charting library is bundled.
15. The **email digest** for new listings is sent at most once per hour per NGO, covering up to 10 nearest listings.
16. A **dev login** endpoint exists for local testing only. It requires `DEV_LOGIN=true` **and** a `localhost` host, and is never enabled in production.

## Licence

[MIT](LICENSE)
