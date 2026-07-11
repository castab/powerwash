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
- In-memory rate limiting on admin login and public endpoints, with constant-time admin login to prevent email enumeration.
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
- `src/server/actions/booking.ts`: booking checkout action, customer cancellation, manage-link resend, and the throttled confirmation-poll reconcile action.
- `src/app/booking/confirmation/confirmation-finalizer.tsx`: client poll loop shown while a payment is syncing; refreshes the server-rendered page on a terminal state and hands off to email after the polling window.
- `src/app/api/booking/confirmation-status/route.ts`: DB-only booking-state probe for the confirmation poll (never calls Stripe, never returns the manage URL).
- `src/lib/booking-sweeper.ts` / `scripts/sweep-stuck-bookings.ts` / `scripts/sweep.sh`: scheduled reconciliation sweeper (stuck sessions, orphaned holds, unsent manage/recovery emails) and its Railway cron entry points.
- `src/lib/booking.ts`: slot lookup queries, held booking creation, expired-hold release, and overlap checks.
- `src/lib/booking-slots.ts`: pure slot computation anchored to the business time zone.
- `src/lib/business-time.ts`: business time zone formatting, parsing, and business-day helpers.
- `src/lib/booking-management.ts`: manage-link generation/rotation, customer booking lookup, cancellation messages, and customer email helpers.
- `src/lib/manage-token.ts`: pure HMAC sign/verify for customer manage-link tokens (no DB/env/email), wrapped by `booking-management.ts` with the booking row and `MANAGE_LINK_SECRET`; unit-tested directly.
- `src/lib/stripe-reconciliation.ts`: Stripe Checkout session reconciliation for deposits and balance payments.
- `src/lib/stripe-reconciliation-decisions.ts`: pure decision helpers (deposit/balance × completed/expired predicates) extracted from the reconciler for decision-table unit tests; the reconciler owns the DB reads/writes and events.
- `src/lib/balance-payment.ts`: admin-requested remaining balance email delivery.
- `src/server/actions/admin.ts`: admin login, service/availability/blackout CRUD, booking updates (with reschedule overlap validation), balance requests, archive actions, and manual refund action. Mutations return a shared `AdminActionState` (`{ error?, success? }`) for expected outcomes and reserve `throw` for unexpected failures.
- `src/components/admin/booking-update-form.tsx`: admin booking status/reschedule/notes form that surfaces update validation errors inline.
- `src/components/admin/service-form.tsx`, `availability-rule-form.tsx`, `blackout-form.tsx`: client forms that wire their admin actions through `useActionState` and render returned validation errors/success inline. `blackout-form.tsx` doubles as the create and edit form; `blackout-remove-button.tsx` posts the per-row deactivate action.
- `scripts/run-tests.mjs` / `scripts/test-resolve-hook.mjs`: the `npm test` runner (discovers all `src/**/*.test.ts`) and its Node resolve hook for the `@/*` alias and extensionless imports.
- `src/components/admin/admin-action-form.tsx`: generic client wrapper for the booking-card button actions (balance request, archive/restore, refunds) that renders their `AdminActionState` result inline; `action-messages.tsx` renders the shared red/green banner.
- `src/app/admin/error.tsx`: error boundary for the `/admin` segment that catches unexpected failures and keeps a styled admin shell.
- `src/lib/auth.ts`: admin cookie creation and admin validation.
- `src/lib/rate-limit.ts`: in-memory fixed-window rate limiter and shared limit presets.
- `src/lib/request-ip.ts`: best-effort client IP resolution for rate limiting.
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
2. Customer opens `/book`, which renders a five-step flow for service, appointment, vehicle, contact, and review. Each step's Continue button remains disabled until its required fields are valid; the service step also waits for a selected address's service-area check and stays disabled when the address is outside the configured area.
3. The service step selects the wash package; the separate appointment step presents the booking window as a horizontally scrollable date strip with Today/Tomorrow, weekday, and month/day labels, then calls `/api/availability?serviceId=...&date=...` to populate morning and afternoon time choices.
4. The customer reviews the reservation and submits it to `createBookingCheckoutAction`.
5. The server validates input with `bookingSchema`.
6. `createHeldBooking` creates a `PENDING_PAYMENT` booking hold with `paymentExpiresAt` set to 35 minutes in the future.
7. The server creates a Stripe Checkout session for the deposit with `expires_at` matched to the hold expiry and redirects the customer to Stripe. If session creation fails, the held booking is released immediately so the slot is not blocked by an orphaned hold.
8. Stripe sends a webhook for `checkout.session.completed`, `checkout.session.expired`, or (as a safety net) the async-payment events.
9. The customer returns to `/booking/confirmation?session_id=...`. While the payment is still syncing, the page polls a DB-only status endpoint automatically (with up to two throttled Stripe re-checks) and flips to the final view on its own; after ~60 seconds it tells the customer they can close the page and that the outcome will arrive by email.
10. If the deposit never completes (abandoned or failed checkout), the customer receives a one-time recovery email inviting them to rebook; if the payment completed but a webhook was missed, the scheduled sweeper reconciles the booking and sends the manage-link email.

### Payment Semantics

- New bookings start as `PENDING_PAYMENT` and `PENDING`.
- Deposit, total price, and remaining balance are saved immediately on the booking.
- Deposit checkout completion promotes the booking to `CONFIRMED` and `PARTIALLY_PAID`.
- Expired deposit checkout marks the held booking `CANCELLED` and `FAILED` if it is still pending.
- The deposit Checkout session expires together with the 35-minute hold, so an abandoned checkout releases its slot within the hold window and a session can never be paid after its hold has lapsed.
- As a backstop, `createHeldBooking` lazily cancels any overlapping `PENDING_PAYMENT` hold whose `paymentExpiresAt` has passed before inserting a new hold, so an orphaned hold can never block a real customer.
- Remaining balance collection is initiated by an admin from the bookings dashboard.
- Balance checkout completion marks `paymentStatus` as `PAID`, zeros `balanceDue`, and records the balance payment intent.
- Balance payment does not automatically mark the service `COMPLETED`.
- Admin cancellation of a deposit-paid booking refunds the deposit, marks the booking `CANCELLED` and `REFUNDED`, and sends an administrative cancellation email.
- Admin full refunds are available for `CONFIRMED` or `COMPLETED` bookings with `PAID` payment state and recorded Stripe payment intents. They refund both the deposit and balance payment, then mark payment `REFUNDED`; confirmed bookings are also cancelled, while completed bookings keep their service status.
- Stripe webhook reconciliation, confirmation-page reconciliation, and the scheduled sweeper share `src/lib/stripe-reconciliation.ts`. The manage-link email these triggers send is best-effort: an email failure is logged but does not fail reconciliation, so the webhook still returns 200 and Stripe does not enter a retry/re-send loop.
- When a deposit hold ends `CANCELLED`/`FAILED` (expired session, lazy cleanup, or async-payment failure), the customer receives a one-time recovery email ("booking wasn't completed, no charge was made, book again here"). Delivery is claimed atomically via `recoveryEmailSentAt` — the same claim/release pattern as the manage-link email — so the webhook, confirmation page, and sweeper can race without double-sending, and a failed send is retried by the next sweeper run.
- Checkout is restricted to instant payment methods (`payment_method_types: ["card"]`) for both deposit and balance sessions. Deferred methods such as ACH settle over days, which is incompatible with the 35-minute hold model; do not enable them in the Stripe dashboard. As a safety net the webhook still handles `checkout.session.async_payment_succeeded` (normal completed path) and `checkout.session.async_payment_failed` (dedicated path: release the hold, send the recovery email, or clear a dead balance session — necessary because a failed async payment leaves the session `complete`/`unpaid`, which the normal reconciler treats as a no-op and which never emits `checkout.session.expired`).

### Payment Reconciliation Sweeper

`src/lib/booking-sweeper.ts` (entry: `scripts/sweep-stuck-bookings.ts`, run with `npm run sweep`) is the scheduled safety net behind the webhook and the confirmation page. It runs every 5 minutes as a Railway cron service and processes five phases, each capped at 25 rows per run with a 4-minute soft deadline:

1. `deposit-sessions`: `PENDING_PAYMENT` holds with a checkout session older than 2 minutes are re-reconciled against Stripe — a missed `completed` webhook confirms the booking and sends the manage-link email; a missed `expired` webhook cancels the hold and sends the recovery email.
2. `orphaned-holds`: lapsed holds with no Stripe session (checkout creation failed and the inline release also failed) are released.
3. `manage-emails`: `CONFIRMED` bookings whose manage-link email never went out are retried.
4. `recovery-emails`: recently expired holds (24-hour lookback, so a first deploy does not email historical rows) still owed a recovery email are retried.
5. `balance-sessions`: outstanding balance checkout sessions are re-reconciled; still-open sessions no-op.

Every mutation goes through the idempotent reconciler or a claim-based email sender, so sweeper runs are safe concurrently with webhooks and with each other. Logs are prefixed `[sweeper]`; exit codes: 0 clean, 1 some items failed (retried next run), 2 fatal.

### Scheduling Rules

- All scheduling math and customer-facing time display are anchored to the business time zone (`America/Los_Angeles`, defined in `src/lib/business-time.ts`), independent of the server's local time zone. Availability rule times, blackout inputs, slot labels, and day boundaries are all interpreted as business-local wall-clock time.
- `AvailabilityRule` stores recurring weekly windows by day of week and business-local start/end time.
- `BlackoutDate` stores one-off blocked ranges.
- `Booking` stores appointment `startAt` and `endAt` ranges.
- Available slots are generated in 15-minute increments.
- Slots starting less than 60 minutes from the current time are filtered out.
- Slot starts are de-duplicated and returned in chronological order, so two overlapping availability rules on the same weekday never emit a duplicate option.
- The day's conflicting bookings are fetched by range overlap (`startAt < dayEnd AND endAt > dayStart`), so a booking that starts the previous day and runs past midnight still masks the slots it occupies.
- Active conflicts include `CONFIRMED`, `COMPLETED`, `NO_SHOW`, and unexpired `PENDING_PAYMENT` bookings.
- Blackout windows block overlapping slots.
- The current implementation assumes a single service bay.

### Double-Booking Protection

- `getAvailableSlots` filters visible slot choices.
- `ensureBookableSlot` rechecks the selected slot before insertion.
- `createHeldBooking` uses a serializable transaction, releases any overlapping expired `PENDING_PAYMENT` holds, and rechecks overlap before insert.
- Admin reschedules run the shared `findOverlappingActiveBooking` check (same active-conflict definition as booking creation, excluding the booking being moved) before applying the new time, and fall back to the exclusion constraint if a conflict is created concurrently.
- The database has a PostgreSQL exclusion constraint to block overlapping active booking ranges, including all `PENDING_PAYMENT` rows.
- Hold, Stripe session, and database lifetimes are aligned: the deposit Checkout session carries `expires_at` equal to the 35-minute `paymentExpiresAt`, expiry webhooks release the row via reconciliation, and lazy cleanup during new booking creation covers holds whose expiry webhook never arrived.
- Prisma database errors during booking creation are normalized to a user-friendly “window was just taken” message.

### Admin Flow

- Admins log in at `/admin/login`.
- Login verifies bcrypt password hashes and writes a signed HTTP-only cookie.
- Login is rate limited per IP and per email (5 failures per 15 minutes). Over-limit sources are rejected before any bcrypt comparison with a generic "Too many login attempts" message; a successful login clears the counters.
- Login is constant-time across failure paths: an unknown email, an inactive account, and a wrong password all run exactly one bcrypt comparison (against a fixed dummy hash when the email has no admin), so response timing cannot be used to enumerate valid admin emails.
- `middleware.ts` blocks `/admin/*` routes when the session cookie is absent. This is a cheap presence check only — Edge middleware cannot reach the database, so it is not authentication. Real verification (signature + admin lookup) happens in `requireAdmin()`, which admin pages enter via `AdminShell`.
- Every mutating admin server action begins with `requireAdmin()`; the middleware cookie check only gates page navigation and is not the authorization boundary for actions. Admin route handlers that do more than clear cookies (unlike `/admin/logout/route.ts`) are not covered by `AdminShell` and must call `requireAdmin()` themselves.
- Admins can manage services, weekly availability, blackout windows, booking status/reschedule notes, balance requests, archive state, eligible late-cancellation refunds, and their own password from `/admin/settings`.
- Blackouts can be created, edited, and removed from `/admin/blackouts`. Each active blackout renders an inline edit form (mirroring the availability-rules page) plus a Remove button that posts to `deactivateBlackoutAction` and sets `isActive: false`. Removing or correcting a mistaken blackout frees its slots in `/api/availability` without hand-editing the database; deactivated blackouts drop off the list. Blackout datetime fields are parsed in the business time zone, and editing re-activates the row.
- Admin reschedules are validated for overlap before the update. A new time that collides with another active booking (confirmed, completed, no-show, or an unexpired hold) is rejected with a readable message naming the conflicting booking, and the booking is left unchanged. The `booking_no_overlap` exclusion constraint remains authoritative: a concurrent booking that slips into the window is caught as a fallback and mapped to the same friendly message, so no raw database error reaches the admin screen. The admin bookings reschedule form surfaces this error (and a success confirmation) inline via the shared `useActionState` result pattern.
- Bookings in final states are locked from further booking status, schedule, and admin note updates. This includes canceled bookings after refund or failed deposit capture, completed paid or refunded bookings, and no-shows.
- The active bookings dashboard keeps a booking visible until it is both terminal and payment-settled, regardless of its appointment date. Upcoming bookings, past bookings still marked `CONFIRMED`, any booking with a `PARTIALLY_PAID` balance (outstanding balance or pending refund decision), and completed paid bookings inside the refund window all remain listed so admins can mark completion, request the remaining balance, or issue refunds after the appointment date has passed. A booking only leaves the active list when it reaches a terminal, settled state or is archived.
- Admin password updates require the current password, a new password, and confirmation of the new password before replacing the stored bcrypt hash.
- Admin mutations surface expected outcomes inline instead of crashing to a generic error page. Service, availability, blackout, balance-request, archive/restore, and refund actions return a `{ error?, success? }` result (`AdminActionState`) that their forms render as a red/green banner via `useActionState`, so validation and precondition messages (for example "Deposit cannot exceed the total price" or "Only canceled bookings can be refunded") stay visible in production builds, where Next.js redacts thrown server-action errors. Only genuinely unexpected failures (database outage, Stripe not returning a payment link) still throw.
- The `/admin` segment has its own error boundary (`src/app/admin/error.tsx`). Unexpected failures render a styled, token-driven page with a "Try again" retry and a link back to the bookings dashboard instead of the default full-page crash, and the admin session stays intact.

### Rate Limiting And Abuse Protection

- `src/lib/rate-limit.ts` provides an in-memory fixed-window limiter with shared bounds in `RATE_LIMITS`. Client IP is resolved by `src/lib/request-ip.ts` from the first `x-forwarded-for` entry, falling back to `x-real-ip`.
- Admin login: 5 failed attempts per 15 minutes, tracked per IP and per email. The limiter is checked before the bcrypt comparison, so throttling stays cheap under a password-spray attack.
- Public availability endpoint (`/api/availability`): 60 requests per minute per IP. Over-limit requests return HTTP `429` with a `Retry-After` header. The limit is generous enough that the booking form's date/service slot lookups are unaffected in normal use.
- Booking checkout (`createBookingCheckoutAction`): 10 attempts per 10 minutes per IP, checked before a hold and Stripe Checkout session are created, because that is the expensive public path.
- Confirmation status polling (`/api/booking/confirmation-status`): 60 requests per minute per IP. The endpoint is a DB-only read (never calls Stripe), and the confirmation page polls it every 3 seconds for at most a minute. The Stripe-touching reconcile action keeps its own 30-second per-session debounce.
- Limiter state is in-process only, so limits are per-instance and reset on restart. This is acceptable for the single-instance Railway deployment. On multi-instance or serverless hosting, treat these limits as best-effort abuse protection rather than a globally coordinated guarantee, and consider a shared store (e.g. Redis) if stronger guarantees are needed.

### Manage Links

- Design principle: customers never create an account, username, or password. The magic link (plus the emails that deliver it) is the entire customer auth surface, chosen deliberately to avoid forcing yet another credential on customers for a service they book a few times a year. New customer-facing features must work within this model — do not introduce customer login flows.
- Customer management links point to `/booking/manage?token=...`.
- Tokens are signed HMAC payloads, not database-stored raw tokens.
- Token payload contains `bookingId`, `manageTokenVersion`, and `manageTokenRotatedAt`.
- Signature uses `MANAGE_LINK_SECRET`.
- Rotation is enforced by comparing token payload values to the current booking version and rotation timestamp.
- Initial manage-link email is sent once after deposit confirmation.
- The initial manage-link email is a best-effort side effect of reconciliation. Payment state is committed before the email is attempted, so a Resend failure is logged with the booking id but does not fail the Stripe webhook or the confirmation-page reconcile action. The customer can still reach the manage link from the confirmation page and can trigger a resend.
- Delivery of the initial email is claimed atomically (`manageLinkSentAt` is set with a conditional `updateMany` before sending), so concurrent reconciliation triggers or webhook retries deliver at most one manage-link email. A failed send releases the claim so a later attempt can retry.
- Resending a manage link rotates the token and invalidates previous links.
- Archived bookings remain customer-accessible until `customerAccessEndsAt`; current code sets this to 18 months after archival.

### Cancellation And Refund Rules

- Customers can cancel confirmed, partially paid bookings through a valid manage link.
- Cancellations at least 24 hours before the appointment attempt an automatic Stripe deposit refund.
- Cancellations inside 24 hours are allowed only after confirmation and do not automatically refund.
- Admin cancellation of deposit-paid bookings refunds the deposit regardless of the customer cancellation window and sends an email noting the booking was administratively canceled.
- Admins can issue eligible late-cancellation deposit refunds from the dashboard.
- Admins can issue full refunds for confirmed or completed paid bookings when both Stripe payment references needed for the paid amounts are present.
- Unresolved bookings remain visible in the admin bookings dashboard even when their appointment date is in the past. This includes paid confirmed or completed bookings inside the refund window, past confirmed bookings still awaiting a completion/no-show decision, partially paid bookings with a balance still due, and canceled partially paid bookings awaiting a late-cancellation refund decision. Such a booking drops off the active list only once it becomes terminal and payment-settled, or is archived.
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
- `booking_no_overlap` exclusion constraint using `tsrange("startAt", "endAt")` over the `TIMESTAMP(3)` columns. All appointment times are stored in UTC, so a zone-less range is correct here; do not "fix" it to `tstzrange` without also changing the column types.

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

These defaults are for local development only. When `NODE_ENV=production`, the seed script refuses to run unless `SEED_ADMIN_PASSWORD` is set to a non-default value, so a public deployment cannot bootstrap the admin account with the documented seed password.

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
2. Set at least `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ADMIN_SESSION_SECRET`, `MANAGE_LINK_SECRET`, `BOOKING_FORM_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, and `SUPPORT_EMAIL`.
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
| `ADMIN_SESSION_SECRET` | Yes | Secret used to sign admin session cookies. Must be at least 32 characters and not a placeholder value; production boots/builds fail closed when it is missing, short, or still a `change-me*`/`replace-with*` value. Local development falls back to an insecure default with a warning. |
| `MANAGE_LINK_SECRET` | Yes | Secret used to sign customer booking management links. Same strength and fail-closed production rules as `ADMIN_SESSION_SECRET`, and validated by both deploy scripts. |
| `BOOKING_FORM_SECRET` | Yes | Secret used to sign the anti-bot booking-form token (proof-of-render + minimum fill time). Same strength and fail-closed production rules as `ADMIN_SESSION_SECRET`. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Optional | Cloudflare Turnstile site key rendered on the final booking step. When unset (together with the secret), the challenge widget and server-side verification are skipped. |
| `TURNSTILE_SECRET_KEY` | Optional | Cloudflare Turnstile secret used for server-side `siteverify`. When empty the Turnstile check is skipped (fails open only when unconfigured; fails closed on an invalid/absent token once a secret is set). |
| `RESEND_API_KEY` | Yes for email | Resend API key for transactional emails. |
| `EMAIL_FROM` | Yes for email | Sender used for customer booking emails. |
| `SUPPORT_EMAIL` | Yes in deploy scripts | Contact address included in booking emails. |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Optional | Browser key for Google Maps JavaScript API + Places API (New) address autocomplete. When unset, the address field degrades to plain manual entry. Also used as the server-side Routes API fallback key, which only works when the key is restricted by API (Maps JavaScript, Places (New), Routes) rather than by HTTP referrer — referrer-restricted keys reject server-to-server calls. Set a billing cap in the Google Cloud console. |
| `GOOGLE_MAPS_SERVER_API_KEY` | Optional | Separate server key for the Routes API travel-time check. Set this when the browser key is referrer-restricted. When neither key allows server calls, service-area checks fail and bookings are blocked with a retry message while the service area is configured — clear the service-area settings in the admin console to disable the gate. |
| `SEED_ADMIN_EMAIL` | Optional | Seed admin login email. Defaults to `admin@example.com`. |
| `SEED_ADMIN_PASSWORD` | Required in production seed | Seed admin login password. Defaults to `ChangeMe123!` in local development. In production the seed script throws when this is unset or still the default, so a public deploy cannot bootstrap the admin with the documented password. |
| `CONFIRMATION_RECONCILE_DEBOUNCE_MS` | Optional | Debounce window for confirmation-page Stripe reconciliation. Defaults to `30000`. |
| `CONFIRMATION_RECONCILE_MAP_MAX_SIZE` | Optional | Max in-memory confirmation reconciliation cache size. Defaults to `1000`. |
| `NEXT_PUBLIC_DEV_BOOKING_PREFILL_ENABLED` | Local only | Shows a dev-only `Use sample data` button on `/book` when set to `true`. |
| `NEXT_PUBLIC_DEV_BOOKING_PREFILL_JSON` | Local only | JSON payload used to fill booking form contact and vehicle fields during development. |

## Dev Booking Prefill

For local development, you can expose a `Use sample data` button on `/book` to fill customer and vehicle fields with a reusable sample payload.

Add these values in `.env.local` or `.env` only for local development:

```env
NEXT_PUBLIC_DEV_BOOKING_PREFILL_ENABLED=true
NEXT_PUBLIC_DEV_BOOKING_PREFILL_JSON={"firstName":"Jordan","lastName":"Taylor","email":"jordan@example.com","phone":"5551234567","vehicleDescription":"2022 Toyota RAV4","color":"Pearl white","licensePlate":"8ABC123","notes":"Pet hair, child seats","address":"1234 Main St, Springfield"}
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

- `npm test` runs `scripts/run-tests.mjs`, which discovers and runs **every** `src/**/*.test.ts` file in its own `node --experimental-strip-types` child process and fails if any file fails. `scripts/test-resolve-hook.mjs` teaches Node the `@/*` path alias and extensionless imports so tests can import app modules without a bundler.
- Current coverage: slot generation and business-time/day math (`booking-slots.test.ts`), money and timezone/DST helpers (`utils.test.ts`), rate limiting (`rate-limit.test.ts`), dev booking prefill (`booking-prefill.test.ts`), manage-link token sign/verify/tamper/rotation (`manage-token.test.ts`), Stripe reconciliation decision table for deposit/balance × completed/expired × already-reconciled/stale-version/wrong-session plus the recovery-email predicate (`stripe-reconciliation-decisions.test.ts`), the sweeper's phase filters and cutoff arithmetic (`booking-sweeper.test.ts`), immutable-booking-state rules (`booking-state.test.ts`), and the service/availability admin-form schemas' create-vs-edit `id` handling (`validators.test.ts`).
- Pure logic is favored for tests. DB-dependent paths (the `createHeldBooking` race, exclusion-constraint rejection, and reconciliation's persistence/events) are still only exercised against a real Postgres and remain a follow-up for an integration harness.
- Prisma client generation runs after install through `postinstall`, and can also be run manually with `npm run prisma:generate`.
- Prisma v7 does not auto-run seed during migration commands; run `npm run prisma:seed` explicitly when seed data is needed.

## Documentation Policy

Documentation is part of every code change. Any change that affects behavior, setup, environment variables, commands, deployment, database schema, user flows, admin flows, payments, emails, auth, security assumptions, or operational behavior must include corresponding documentation updates.

At minimum, consider whether to update:

- `README.md` for developer-facing setup, architecture, workflow, deployment, or behavior changes.
- `.env.example` for every environment variable addition, rename, removal, or format/default change.
- `AGENTS.md` for AI-specific instructions, invariants, commands, or repo conventions.
- Prisma migrations and schema notes when database behavior changes.
- `docs/issues/` for known-but-deferred work items (numbered markdown files with findings, a resolution plan, and acceptance criteria).

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
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`

5. Set `STRIPE_WEBHOOK_SECRET` from the webhook endpoint signing secret.
6. Keep deferred payment methods (ACH and similar) disabled: Checkout sessions are created with `payment_method_types: ["card"]` because multi-day settlement is incompatible with the 35-minute booking hold. The async-payment events above are subscribed as a safety net only.

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

Because the bootstrap seed can run against a fresh production database, set `SEED_ADMIN_PASSWORD` to a strong, unique value before the first deploy. The seed script throws in production when it is unset or still the default `ChangeMe123!`, which fails the container start rather than creating an admin with the publicly documented password.

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

### Railway Cron Service (Booking Sweeper)

The booking sweeper (see "Payment Reconciliation Sweeper" above) runs as a second Railway service built from the same repo and Dockerfile:

1. In the same Railway project, add another service from this repo (same Dockerfile deploy).
2. Set the service's Custom Start Command to `sh ./scripts/sweep.sh`.
3. Set the service's Cron Schedule to `*/5 * * * *`. The process exits after each run; Railway skips a scheduled run if the previous one is still going, and the sweeper's internal 4-minute soft deadline keeps runs inside the cadence.
4. Give the cron service the same environment variables as the web service (use Railway shared/reference variables). All of them are required — `scripts/sweep.sh` runs the same env validation as `start.sh`, and `getEnv()` hard-requires the secrets in production even though the sweeper never uses the admin session secret. `PORT` is unused.

`scripts/sweep.sh` intentionally does not run migrations or seeding — the web service owns those, and a cron tick must never race a deploy's `prisma migrate deploy`.

Expected cron run logs:

```text
[railway-sweep] Validating environment
[railway-sweep] Running booking sweeper
[sweeper] summary phase=deposit-sessions processed=0 failed=0
[sweeper] summary phase=orphaned-holds processed=0 failed=0
[sweeper] summary phase=manage-emails processed=0 failed=0
[sweeper] summary phase=recovery-emails processed=0 failed=0
[sweeper] summary phase=balance-sessions processed=0 failed=0
[sweeper] done in 42ms failed=0 deadlineHit=false
```

To verify the whole safety net end-to-end in production, temporarily disable the Stripe webhook endpoint in the Stripe dashboard, make a test booking, and watch the sweeper confirm it within one cron cycle (the booking's event history will show `actorLabel: "sweeper"`). Re-enable the webhook afterwards.

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
- Treat Stripe webhooks as the source of truth for payment completion, with the confirmation page's automatic poll as the on-page fallback for delayed webhooks and the scheduled sweeper as the last-resort safety net for missed webhooks and unsent emails.
- The confirmation-page reconciliation debounce (`recentConfirmationReconciliations` in `src/server/actions/booking.ts`) is an in-memory, per-instance map, not a global lock. On a multi-instance or serverless deploy each instance keeps its own map, so the same session can be reconciled once per instance. This is harmless because reconciliation is idempotent and the webhook remains authoritative; do not rely on it as a distributed guard.
- Treat management links as security-sensitive signed tokens. Do not log raw tokens or weaken signature/rotation behavior.
