# Powerwash Booking

Production-oriented, mobile-first car wash booking application built with Next.js App Router, TypeScript, PostgreSQL, Prisma, Tailwind CSS, Stripe, Resend, and Railway/Vercel deployment conventions.

## Features

- Customer-facing service browsing and booking flow.
- Live availability lookup from recurring weekly rules, blackout windows, and existing bookings.
- Stripe Checkout for booking deposits and admin-requested remaining balance collection.
- Stripe webhook and confirmation-page reconciliation for payment state changes.
- Secure customer booking management links sent by email.
- Customer cancellation flow with automatic deposit refund when cancellation is at least 24 hours before the appointment.
- Admin dashboard for services, weekly availability, blackout dates, bookings, balance requests, archival, eligible manual refunds, and admin password updates.
- Database-level overlap protection using a PostgreSQL exclusion constraint.
- Business-logic overlap validation using serializable transactions.
- Booking event audit trail for payments, admin actions, cancellations, manage links, archival, and balance requests.
- Seed data for services, weekly rules, and an admin account.
- Minimal PWA manifest.

## Stack

- Next.js App Router, React 19, and TypeScript.
- Tailwind CSS.
- PostgreSQL with Prisma ORM.
- Zod validation for form and action input.
- Stripe Checkout and Stripe webhooks.
- Resend transactional email API.
- Signed JWT admin session cookie with `jose` and bcrypt password verification.
- Docker Compose for local app/database development with an optional Stripe CLI helper.
- Railway Dockerfile deployment and Vercel build-command deployment support.

## UI Styling Direction

The app uses Tailwind CSS with shared design tokens in `src/app/globals.css`. Fonts, colors, and palette values should remain interchangeable through `:root` variables and the Tailwind `@theme inline` mapping. Avoid hard-coding brand-specific colors or font choices in page components unless a design direction explicitly calls for it.

Public, customer-facing, and admin screens should favor a connected, flowing page structure instead of repeated standalone cards. Prefer broad sections, soft background bands, restrained dividers, generous spacing, and semantic utilities such as `flow-page`, `flow-section`, `soft-band`, `soft-surface`, `surface-block`, `eyebrow`, and `page-title`.

Use contained surfaces when they serve a functional purpose, such as forms, checkout summaries, manage-link details, warnings, errors, or security-sensitive actions. Avoid using the legacy `panel` treatment as the default wrapper for every section.

Admin screens should share the same visual language as the rest of the application, including the admin login page. Keep admin workflows scannable, but use the same soft surfaces, page rhythm, rounded navigation, and token-driven palette as public pages.

## Project Structure

```text
.
|- prisma/
|  |- migrations/
|  |- schema.prisma
|  `- seed.ts
|- scripts/
|  |- check-bootstrap.ts
|  |- start.sh
|  `- vercel-build.mjs
|- src/
|  |- app/
|  |  |- admin/
|  |  |- api/
|  |  |- book/
|  |  `- booking/
|  |- components/
|  |- generated/prisma/
|  |- lib/
|  `- server/actions/
|- AGENTS.md
|- Dockerfile
|- docker-compose.yml
|- middleware.ts
|- prisma.config.ts
`- .env.example
```

## Key Files

- `src/app/page.tsx`: public home page and service listing.
- `src/app/globals.css`: Tailwind theme tokens and shared UI primitives.
- `src/app/book/page.tsx`: customer booking page.
- `src/components/booking/booking-form.tsx`: booking UI, slot fetch behavior, and dev prefill integration.
- `src/app/api/availability/route.ts`: public slot lookup endpoint.
- `src/server/actions/booking.ts`: booking checkout action, customer cancellation, manage-link resend, and confirmation reconciliation action.
- `src/lib/booking.ts`: slot computation, held booking creation, and overlap checks.
- `src/lib/booking-management.ts`: signed manage-link generation/rotation, customer booking lookup, cancellation messages, and customer email helpers.
- `src/lib/stripe-reconciliation.ts`: Stripe Checkout session reconciliation for deposits and balance payments.
- `src/lib/balance-payment.ts`: admin-requested remaining balance email delivery.
- `src/server/actions/admin.ts`: admin login, service/availability/blackout CRUD, booking updates, balance requests, archive actions, and manual refund action.
- `src/lib/auth.ts`: admin cookie creation and admin validation.
- `src/lib/env.ts`: runtime environment variable reads and local dev booking prefill parsing.
- `src/generated/prisma/`: generated Prisma v7 client output. This directory is generated and ignored by Git.
- `prisma.config.ts`: Prisma CLI configuration, including schema path, migration path, seed command, and database URLs.
- `prisma/schema.prisma`: data model, enums, indexes, and relations.
- `prisma/migrations/`: database migrations, including overlap constraints.
- `prisma/seed.ts`: default services, availability, and admin user.
- `scripts/start.sh`: Railway runtime startup sequence.
- `scripts/vercel-build.mjs`: Vercel build-time migration/bootstrap sequence.

## Architecture

### Customer Booking Flow

1. Customer opens `/` to browse active services.
2. Customer opens `/book`, which renders a four-step flow for appointment, vehicle, contact, and review.
3. The appointment step uses a date input constrained to the booking window, then calls `/api/availability?serviceId=...&date=...` to populate morning and afternoon time choices.
4. The customer reviews the reservation and submits it to `createBookingCheckoutAction`.
5. The server validates input with `bookingSchema`.
6. `createHeldBooking` creates a `PENDING_PAYMENT` booking hold with `paymentExpiresAt` set to 30 minutes in the future.
7. The server creates a Stripe Checkout session for the deposit and redirects the customer to Stripe.
8. Stripe sends a webhook for `checkout.session.completed` or `checkout.session.expired`.
9. The customer returns to `/booking/confirmation?session_id=...`, which can retry reconciliation if the webhook has not completed yet.

### Payment Semantics

- New bookings start as `PENDING_PAYMENT` and `PENDING`.
- Deposit, total price, and remaining balance are saved immediately on the booking.
- Deposit checkout completion promotes the booking to `CONFIRMED` and `PARTIALLY_PAID`.
- Expired deposit checkout marks the held booking `CANCELLED` and `FAILED` if it is still pending.
- Remaining balance collection is initiated by an admin from the bookings dashboard.
- Balance checkout completion marks `paymentStatus` as `PAID`, zeros `balanceDue`, and records the balance payment intent.
- Balance payment does not automatically mark the service `COMPLETED`.
- Admin cancellation of a deposit-paid booking refunds the deposit, marks the booking `CANCELLED` and `REFUNDED`, and sends an administrative cancellation email.
- Admin full refunds are available for `CONFIRMED` or `COMPLETED` bookings with `PAID` payment state and recorded Stripe payment intents. They refund both the deposit and balance payment, then mark payment `REFUNDED`; confirmed bookings are also cancelled, while completed bookings keep their service status.
- Stripe webhook reconciliation and confirmation-page reconciliation share `src/lib/stripe-reconciliation.ts`.

### Scheduling Rules

- `AvailabilityRule` stores recurring weekly windows by day of week and local start/end time.
- `BlackoutDate` stores one-off blocked ranges.
- `Booking` stores appointment `startAt` and `endAt` ranges.
- Available slots are generated in 15-minute increments.
- Slots starting less than 60 minutes from the current time are filtered out.
- Active conflicts include `CONFIRMED`, `COMPLETED`, `NO_SHOW`, and unexpired `PENDING_PAYMENT` bookings.
- Blackout windows block overlapping slots.
- The current implementation assumes a single service bay.

### Double-Booking Protection

- `getAvailableSlots` filters visible slot choices.
- `ensureBookableSlot` rechecks the selected slot before insertion.
- `createHeldBooking` uses a serializable transaction and rechecks overlap before insert.
- The database has a PostgreSQL exclusion constraint to block overlapping active booking ranges.
- Prisma database errors during booking creation are normalized to a user-friendly “window was just taken” message.

### Admin Flow

- Admins log in at `/admin/login`.
- Login verifies bcrypt password hashes and writes a signed HTTP-only cookie.
- `middleware.ts` blocks `/admin/*` routes when the cookie is absent.
- Server actions call `requireAdmin()` where authenticated admin identity is required.
- Admins can manage services, weekly availability, blackout windows, booking status/reschedule notes, balance requests, archive state, eligible late-cancellation refunds, and their own password from `/admin/settings`.
- Bookings in final states are locked from further booking status, schedule, and admin note updates. This includes canceled bookings after refund or failed deposit capture, completed paid or refunded bookings, and no-shows.
- Admin password updates require the current password, a new password, and confirmation of the new password before replacing the stored bcrypt hash.

### Manage Links

- Customer management links point to `/booking/manage?token=...`.
- Tokens are signed HMAC payloads, not database-stored raw tokens.
- Token payload contains `bookingId`, `manageTokenVersion`, and `manageTokenRotatedAt`.
- Signature uses `MANAGE_LINK_SECRET`.
- Rotation is enforced by comparing token payload values to the current booking version and rotation timestamp.
- Initial manage-link email is sent once after deposit confirmation.
- Resending a manage link rotates the token and invalidates previous links.
- Archived bookings remain customer-accessible until `customerAccessEndsAt`; current code sets this to 18 months after archival.

### Cancellation And Refund Rules

- Customers can cancel confirmed, partially paid bookings through a valid manage link.
- Cancellations at least 24 hours before the appointment attempt an automatic Stripe deposit refund.
- Cancellations inside 24 hours are allowed only after confirmation and do not automatically refund.
- Admin cancellation of deposit-paid bookings refunds the deposit regardless of the customer cancellation window and sends an email noting the booking was administratively canceled.
- Admins can issue eligible late-cancellation deposit refunds from the dashboard.
- Admins can issue full refunds for confirmed or completed paid bookings when both Stripe payment references needed for the paid amounts are present.
- Paid confirmed or completed bookings remain visible in the admin bookings dashboard for refund handling even when their appointment date is in the past.
- Final booking states are no longer editable from the admin dashboard. This includes canceled bookings after refund or failed deposit capture, completed paid or refunded bookings, and no-shows.
- Terminal bookings such as `COMPLETED` and `NO_SHOW` cannot be canceled online.
- Fully paid bookings are treated as not cancellable through the customer manage flow.

## Database Schema

Main models:

- `Service`: service name, slug, duration, base price, deposit, and active flag.
- `Booking`: customer, combined vehicle description, appointment range, payment state, Stripe deposit, balance, and refund references, manage-link metadata, balance request metadata, refund metadata, archival metadata, and audit events.
- `AvailabilityRule`: recurring weekly hours.
- `BlackoutDate`: one-off blocked windows.
- `AdminUser`: dashboard login identity.
- `BookingEvent`: audit trail for payment, cancellation, admin, manage-link, archive, and balance actions.

Important database protections:

- PostgreSQL enums for booking, payment, balance request delivery, and event status values.
- Indexes for schedule, admin, archive, and event queries.
- `booking_valid_range` check constraint.
- `booking_no_overlap` exclusion constraint using `tstzrange`.

When schema, migrations, seed data, or model semantics change, update this README, `.env.example` if relevant, and `AGENTS.md` if AI guidance changes.

Prisma v7 notes:

- The Prisma CLI reads its connection URL from `prisma.config.ts`, not datasource `url` fields in `prisma/schema.prisma`.
- `prisma.config.ts` uses `DIRECT_URL` when present, then falls back to `DATABASE_URL`, then to the local PostgreSQL example URL for client generation before `.env` exists.
- The generated client uses the `prisma-client` generator and is written to `src/generated/prisma`.
- Application code imports Prisma types, enums, and `PrismaClient` from `@/generated/prisma/client`.
- Runtime PostgreSQL connections use the Prisma `pg` driver adapter from `@prisma/adapter-pg`.
- App runtime uses `DATABASE_URL`; seed/bootstrap scripts use `DIRECT_URL` when present, then `DATABASE_URL`. All adapter paths fall back to the local example URL when neither variable is set.
- `dotenv` is loaded explicitly for Prisma CLI config and standalone seed/bootstrap scripts.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment template and fill in local values:

```bash
cp .env.example .env
```

3. Create or start a PostgreSQL database.

4. Apply local development migrations:

```bash
npm run prisma:dev
```

5. Seed default services, availability, and admin user:

```bash
npm run prisma:seed
```

6. Start the development server:

```bash
npm run dev
```

The app runs at `http://localhost:3000` by default.

Default seed admin credentials, unless overridden by environment variables:

- Email: `admin@example.com`
- Password: `ChangeMe123!`

For production-like migration application, use:

```bash
npm run prisma:migrate
```

## Docker Compose Development

This repo includes a local development Compose setup in `docker-compose.yml`.

What it does:

- Runs PostgreSQL 18 on `localhost:5432`.
- Runs the Next.js app on `http://localhost:3000`.
- Mounts the repo into the app container for live reload.
- Overrides `DATABASE_URL` and `DIRECT_URL` inside the app container to use the Compose service host `db`.
- Runs `npm install`, Prisma client generation, migrations, seed, and `next dev --webpack` automatically.
- Uses webpack dev mode in Docker because file watching is more reliable than Turbopack on Windows bind mounts.
- Includes an optional Stripe CLI helper service for local webhook forwarding.
- Is intended for local development only, not Railway production deployment.

Before first run:

1. Copy `.env.example` to `.env`.
2. Set at least `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ADMIN_SESSION_SECRET`, `MANAGE_LINK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, and `SUPPORT_EMAIL`.
3. Leave database URLs in `.env` as-is if you also want to run the app on the host. Compose overrides them automatically for the containerized app.

Start the stack:

```bash
docker compose up --build
```

Apply migrations from the running app container:

```bash
docker compose exec app npm run prisma:dev
```

Seed the database:

```bash
docker compose exec app npm run prisma:seed
```

Stop the stack:

```bash
docker compose down
```

Remove containers and the Postgres data volume:

```bash
docker compose down -v
```

## Stripe Local Webhooks

The app confirms payments through `POST /api/stripe/webhook`, so local development needs Stripe events forwarded to the local app.

The Compose stack includes an optional `stripe-cli` helper service that runs:

```bash
stripe listen --forward-to http://app:3000/api/stripe/webhook
```

First-time login:

```bash
docker compose run --rm stripe-cli login
```

Start the listener after the app is already running:

```bash
docker compose --profile stripe up stripe-cli
```

Important manual step:

1. Copy the `whsec_...` signing secret from the `stripe-cli` container logs.
2. Add it to `.env` as `STRIPE_WEBHOOK_SECRET=...`.
3. Restart the app container so Next.js picks up the new value.

```bash
docker compose restart app
```

Useful commands:

```bash
docker compose logs -f stripe-cli
docker compose run --rm stripe-cli login
docker compose --profile stripe up stripe-cli
```

Troubleshooting:

- Seeing `--> checkout.session.completed` in Stripe CLI is not enough by itself; also look for forwarded POST responses to `/api/stripe/webhook`.
- If webhook forwarding works but the app rejects the request, the most common cause is a missing or stale `STRIPE_WEBHOOK_SECRET`.
- The Stripe CLI helper is for local development only. Production and staging environments should receive Stripe webhooks directly at the public `/api/stripe/webhook` URL.

## Environment Variables

Copy `.env.example` to `.env` for local development. Update `.env.example` whenever a new environment variable is added, renamed, removed, or its expected format changes.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Prisma PostgreSQL connection string. |
| `DIRECT_URL` | Yes | Direct PostgreSQL connection for Prisma migrations. |
| `NEXT_PUBLIC_APP_URL` | Yes | Canonical public base URL used for emailed links and as a fallback when request origin cannot be inferred. Stripe checkout redirects use the current request origin when available. |
| `STRIPE_SECRET_KEY` | Yes for payments | Stripe secret API key. |
| `STRIPE_WEBHOOK_SECRET` | Yes for webhook | Stripe signing secret for `/api/stripe/webhook`. |
| `ADMIN_SESSION_SECRET` | Yes | Secret used to sign admin session cookies. Use a strong value outside local development. |
| `MANAGE_LINK_SECRET` | Yes | Secret used to sign customer booking management links. Use a strong value outside local development. |
| `RESEND_API_KEY` | Yes for email | Resend API key for transactional emails. |
| `EMAIL_FROM` | Yes for email | Sender used for customer booking emails. |
| `SUPPORT_EMAIL` | Yes in deploy scripts | Contact address included in booking emails. |
| `SEED_ADMIN_EMAIL` | Optional | Seed admin login email. Defaults to `admin@example.com`. |
| `SEED_ADMIN_PASSWORD` | Optional | Seed admin login password. Defaults to `ChangeMe123!`. |
| `CONFIRMATION_RECONCILE_DEBOUNCE_MS` | Optional | Debounce window for confirmation-page Stripe reconciliation. Defaults to `30000`. |
| `CONFIRMATION_RECONCILE_MAP_MAX_SIZE` | Optional | Max in-memory confirmation reconciliation cache size. Defaults to `1000`. |
| `NEXT_PUBLIC_DEV_BOOKING_PREFILL_ENABLED` | Local only | Shows a dev-only `Use sample data` button on `/book` when set to `true`. |
| `NEXT_PUBLIC_DEV_BOOKING_PREFILL_JSON` | Local only | JSON payload used to fill booking form contact and vehicle fields during development. |

## Dev Booking Prefill

For local development, you can expose a `Use sample data` button on `/book` to fill customer and vehicle fields with a reusable sample payload.

Add these values in `.env.local` or `.env` only for local development:

```env
NEXT_PUBLIC_DEV_BOOKING_PREFILL_ENABLED=true
NEXT_PUBLIC_DEV_BOOKING_PREFILL_JSON={"firstName":"Jordan","lastName":"Taylor","email":"jordan@example.com","phone":"5551234567","vehicleDescription":"2022 Toyota RAV4","color":"Pearl white","licensePlate":"8ABC123","notes":"Pet hair, child seats"}
```

Notes:

- The helper only fills text fields.
- It does not change service, date, or selected time slot.
- Invalid or incomplete JSON disables the feature without crashing the page.
- This is intended for local development only and should not be enabled in production.

## Verification Commands

Run the relevant checks before handing off changes:

```bash
npm run lint
npm test
npm run build
```

Notes:

- `npm test` currently runs `src/lib/booking-prefill.test.ts`.
- `src/lib/utils.test.ts` is present but is not currently included in the package `test` script.
- Prisma client generation runs after install through `postinstall`, and can also be run manually with `npm run prisma:generate`.
- Prisma v7 does not auto-run seed during migration commands; run `npm run prisma:seed` explicitly when seed data is needed.

## Documentation Policy

Documentation is part of every code change. Any change that affects behavior, setup, environment variables, commands, deployment, database schema, user flows, admin flows, payments, emails, auth, security assumptions, or operational behavior must include corresponding documentation updates.

At minimum, consider whether to update:

- `README.md` for developer-facing setup, architecture, workflow, deployment, or behavior changes.
- `.env.example` for every environment variable addition, rename, removal, or format/default change.
- `AGENTS.md` for AI-specific instructions, invariants, commands, or repo conventions.
- Prisma migrations and schema notes when database behavior changes.

If a change does not require documentation updates, call that out explicitly in the change summary or pull request notes.

## Stripe Setup

1. Stripe Checkout uses inline `price_data`, so no catalog product setup is required.
2. Set `STRIPE_SECRET_KEY`.
3. Add a webhook endpoint:

```text
https://your-domain.com/api/stripe/webhook
```

4. Subscribe to these events:

- `checkout.session.completed`
- `checkout.session.expired`

5. Set `STRIPE_WEBHOOK_SECRET` from the webhook endpoint signing secret.

## Railway Deployment

Railway deployment is Dockerfile-based and should use the production `Dockerfile`, not the local `docker-compose.yml`.

Deployment files:

- `Dockerfile`: production image build for Railway.
- `.dockerignore`: excludes local-only files from the Docker build context.
- `scripts/start.sh`: runtime orchestration for env validation, migrations, seed-once, and app startup.
- `scripts/prepare-standalone.mjs`: copies static assets into the Next.js standalone output after `next build`.
- `scripts/check-bootstrap.ts`: database sentinel check used to decide whether bootstrap seeding is needed.

The production image copies `prisma.config.ts` before `npm ci` because `postinstall` runs Prisma client generation and Prisma v7 reads CLI configuration from that file.

Every Railway container start performs this sequence:

1. Validate required environment variables.
2. Ensure Prisma client is available.
3. Run `prisma migrate deploy`.
4. Check whether any `AdminUser` records exist.
5. Run the seed script only if no admin users exist.
6. Start the app with `node .next/standalone/server.js`.

This means migrations run on every app start, bootstrap seed runs only once for an empty database, and later restarts skip seeding automatically. Because `next.config.ts` uses `output: "standalone"`, production starts the generated standalone server directly rather than `next start`.

Railway setup:

1. Create a new Railway project.
2. Add a PostgreSQL service.
3. Create the app service from this repo.
4. In the Railway service settings, deploy using the repo Dockerfile.
5. Set the required environment variables from the table above.
6. Map `DATABASE_URL` to Railway PostgreSQL `DATABASE_URL`.
7. Map `DIRECT_URL` to Railway PostgreSQL `DATABASE_PRIVATE_URL` if available, otherwise `DATABASE_URL`.
8. Trigger the first deploy.

Expected first deploy logs include:

```text
[railway-start] Validating environment
[railway-start] Running database migrations
[railway-start] Checking bootstrap data
[railway-start] Bootstrap data missing, running seed
[railway-start] Starting Next.js
```

Expected later restart logs include:

```text
[railway-start] Checking bootstrap data
[railway-start] Bootstrap data already present, skipping seed
```

If you need to reseed intentionally, use a Railway shell or one-off command after clearing the relevant bootstrap data:

```bash
npm run prisma:seed
```

Because startup uses `AdminUser` existence as the seed sentinel, automatic seed will not rerun while admin users remain present.

## Vercel Deployment

Vercel does not run the Railway startup script, so this repo includes a dedicated build command in `vercel.json`.

During Vercel builds, `npm run build:vercel` performs this sequence:

1. Validate required environment variables.
2. Generate the Prisma client.
3. Run `prisma migrate deploy`.
4. Check whether bootstrap seed data is needed.
5. Run the seed script only when no admin users exist.
6. Run `next build`.

Set the same required environment variables used in Railway.

Notes:

- Vercel applies migrations at build time, not on runtime startup.
- Seed execution is idempotent because it is gated by the existing `seed:check` script.

## Operational Notes

- Currency values are stored as dollar decimals with cent precision.
- The current implementation assumes a single service bay. If the business later needs multiple simultaneous bays, add a resource dimension to `Booking` and the exclusion constraint.
- PWA support is intentionally minimal to keep the core booking flow prioritized.
- Treat Stripe webhooks as the source of truth for payment completion, with confirmation-page reconciliation as a fallback for delayed webhooks.
- Treat management links as security-sensitive signed tokens. Do not log raw tokens or weaken signature/rotation behavior.
