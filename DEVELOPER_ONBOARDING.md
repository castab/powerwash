# Developer Onboarding Guide

## 1) What this app is
Powerwash is a production-oriented, mobile-first car wash booking application built with Next.js App Router and a PostgreSQL/Prisma backend. It supports:
- Customer self-serve booking with deposit checkout.
- Admin operations for services, availability, blackout windows, and bookings.
- Stripe webhook-driven deposit and balance confirmation.
- Secure booking management links ("magic links") sent by email.

## 2) Tech stack at a glance
- **Frontend/runtime:** Next.js App Router (React 19 + TypeScript), Tailwind CSS.
- **Data layer:** PostgreSQL with Prisma ORM.
- **Validation:** Zod schemas for form/action input.
- **Payments:** Stripe Checkout + Stripe webhooks.
- **Email delivery:** Resend API.
- **Admin auth:** Signed JWT session cookie (`jose`) + bcrypt password verification.
- **Deployment/local:** npm scripts + Docker Compose for local DB/app + optional Stripe CLI helper.

## 3) High-level architecture and request flow

### Customer booking path
1. User opens `/book`, which renders available active services.
2. Client booking form calls `/api/availability?serviceId=...&date=...` to retrieve open slots.
3. User submits booking form to server action `createBookingCheckoutAction`.
4. Server validates with `bookingSchema`, creates a **held booking** (`PENDING_PAYMENT`) with a short expiration.
5. Server creates a Stripe Checkout session for the deposit and redirects customer to Stripe.
6. Stripe sends webhook:
   - `checkout.session.completed` for deposit checkout → booking becomes `CONFIRMED` + `PARTIALLY_PAID`; initial manage-link email is sent.
   - `checkout.session.expired` → held booking is canceled/failed.
7. Later, an admin can request the remaining balance through a second Stripe Checkout session; that webhook marks the booking paid in full without auto-completing the service.
7. Customer returns to confirmation page.

### Admin path
- Admin logs in at `/admin/login`; successful login sets a signed cookie.
- Middleware checks for cookie on `/admin/*`; server-side `requireAdmin()` additionally validates user exists/is active.
- Admin can manage services, recurring availability, blackout windows, booking status/reschedule notes, and manual late-cancellation refunds.

## 4) Scheduling and booking logic (important)

### Data model for scheduling
- `AvailabilityRule`: recurring weekly windows (day-of-week + start/end times).
- `BlackoutDate`: one-off blocked time ranges.
- `Booking`: stores appointment interval (`startAt`/`endAt`), payment lifecycle for deposit + balance, and hold expiration.

### Slot generation (`getAvailableSlots`)
- Slot interval granularity is **15 minutes**.
- Uses selected service duration to compute each candidate window.
- Filters out:
  - Slots starting in under 60 minutes from "now".
  - Overlaps with active bookings:
    - `CONFIRMED`, `COMPLETED`, `NO_SHOW`
    - `PENDING_PAYMENT` bookings whose hold has not expired.
  - Overlaps with active blackout ranges.

### Race-condition protection when creating a booking
The app applies **multiple safeguards** to prevent double-booking:
1. **Pre-check**: `ensureBookableSlot` confirms slot still appears available.
2. **Serializable transaction** in `createHeldBooking` re-checks overlap before insert.
3. **Database exclusion constraint** (`booking_no_overlap` on a tsrange) blocks overlapping ranges for active booking states.
4. Prisma known/unknown DB errors are normalized to a user-friendly “window was just taken” message.

### Booking hold and payment semantics
- New bookings start as `PENDING_PAYMENT` with `paymentExpiresAt = now + 30 min`.
- Deposit and balance split are saved immediately (`totalPrice`, `depositAmount`, `balanceDue`).
- If deposit checkout completes in time, webhook promotes booking to `CONFIRMED` + `PARTIALLY_PAID`.
- If checkout expires, webhook marks booking `CANCELLED` + `FAILED`.
- If an admin later requests the remaining balance and that checkout completes, webhook promotes payment state to `PAID` and zeros `balanceDue`.

## 5) Magic link generation + rotation logic (important)

### What the magic link is
A customer-facing secure URL to `/booking/manage?token=...` used to:
- View booking details.
- Cancel booking.
- Request a fresh rotated management link.

### How token security works
- Raw token is 32 random bytes, encoded `base64url`.
- DB stores **only SHA-256 hash** of token (`manageTokenHash`), never raw token.
- Lookup is done by hashing incoming token and finding matching booking.

### Rotation and email behavior
- `rotateAndSendManageBookingEmail(bookingId)`:
  1. Generates new raw token and hash.
  2. Updates booking hash + rotated timestamp.
  3. Sends email containing URL with raw token.
  4. If send fails, hash is reverted (so old link remains valid).
  5. On success, `manageLinkSentAt` is updated.
- `ensureInitialManageBookingEmail` ensures first manage link is sent once after successful payment confirmation.
- Resend action rotates token again, invalidating previous links.

### Cancellation rules through manage link
- If ≥24h before appointment: auto Stripe refund of deposit is attempted and booking becomes `CANCELLED` + `REFUNDED`.
- If inside 24h: cancellation is allowed but no auto-refund; booking remains paid until admin processes refund (if desired).
- Terminal states (`COMPLETED`/`NO_SHOW`) cannot be canceled online.

## 6) Key files to know first
- `src/components/booking/booking-form.tsx` – UI booking flow and slot fetch behavior.
- `src/lib/booking.ts` – slot computation + held booking creation + overlap checks.
- `src/server/actions/booking.ts` – booking action, Stripe checkout creation, and manage-link cancellation/resend actions.
- `src/app/api/availability/route.ts` – slot API.
- `src/app/api/stripe/webhook/route.ts` – webhook state transitions + initial manage-email trigger.
- `src/lib/booking-management.ts` – token hashing/rotation/email and cancellation message codes.
- `src/server/actions/admin.ts` – admin CRUD and manual refund action.
- `prisma/schema.prisma` + migrations – data model and DB-level constraints.

## 7) Environment variables to configure early
Core values to set for a functional local setup:
- `DATABASE_URL`, `DIRECT_URL`
- `NEXT_PUBLIC_APP_URL`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `ADMIN_SESSION_SECRET`
- `RESEND_API_KEY`, `EMAIL_FROM` (and optional `SUPPORT_EMAIL`)

Optional local-only convenience values:
- `NEXT_PUBLIC_DEV_BOOKING_PREFILL_ENABLED`
- `NEXT_PUBLIC_DEV_BOOKING_PREFILL_JSON`

## 8) Local developer quickstart
1. Install deps: `npm install`
2. Apply migrations: `npm run prisma:dev`
3. Seed defaults (services, availability, admin): `npm run prisma:seed`
4. Start app: `npm run dev`
5. Optional containerized path: `docker compose up --build`

### Optional dev booking prefill
- Add `NEXT_PUBLIC_DEV_BOOKING_PREFILL_ENABLED=true` in `.env.local` to show a `Use sample data` button on `/book`.
- Set `NEXT_PUBLIC_DEV_BOOKING_PREFILL_JSON` to a single JSON object containing customer and vehicle fields:
  `firstName`, `lastName`, `email`, `phone`, `make`, `model`, `year`, `color`, `licensePlate`, `notes`
- The helper only fills those text fields; it does not change service, date, or selected time slot.
- Invalid JSON disables the feature without crashing the page.

### Stripe CLI for local webhook forwarding (first run vs later runs)
The app confirms payment through `POST /api/stripe/webhook`, so local development needs Stripe
events to be forwarded to your local app instance.

If you are using Docker Compose, there is an optional `stripe-cli` helper service that runs:
`stripe listen --forward-to http://app:3000/api/stripe/webhook`.

#### First startup behavior
1. Authorize Stripe CLI once:
   - `docker compose run --rm stripe-cli login`
2. Start listener:
   - `docker compose --profile stripe up stripe-cli`
3. Watch logs and copy the signing secret (`whsec_...`) printed by Stripe CLI.
4. Put that value in your `.env` as `STRIPE_WEBHOOK_SECRET=...`.
5. Restart app process/container so env is reloaded.

Without that `STRIPE_WEBHOOK_SECRET`, webhook signature verification fails and bookings won’t be
promoted from `PENDING_PAYMENT` to `CONFIRMED` after checkout.

#### Subsequent startups
- You usually do **not** need to re-run login because Stripe CLI auth is persisted in the Docker
  volume (`stripe_config`).
- You still need to ensure the listener is running during testing (`docker compose --profile stripe up stripe-cli`).
- The webhook signing secret can rotate if you restart listeners in a new context; if webhook
  verification suddenly fails locally, recopy the current `whsec_...` from Stripe CLI logs and
  update `.env`, then restart the app.

#### Helpful verification signals
- Stripe CLI logs should show events like `checkout.session.completed` and successful forwards to
  `/api/stripe/webhook`.
- App-side expected result for the first checkout is booking status transition to `CONFIRMED` and payment status `PARTIALLY_PAID`.

Default seed admin credentials (override with env):
- Email: `admin@example.com`
- Password: `ChangeMe123!`

## 9) Mental model for new contributors
- Treat bookings as **time ranges with state transitions** (not just rows).
- Stripe webhook is the source of truth for payment completion.
- Management links are security-sensitive: hash at rest + rotate often.
- Scheduling correctness relies on both app logic and DB constraints—keep both layers when refactoring.
