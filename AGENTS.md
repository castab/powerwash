# AGENTS.md

Instructions for AI coding agents working in this repository.

## Repository Purpose

Powerwash is a production-oriented car wash booking app. It uses Next.js App Router, React 19, TypeScript, PostgreSQL, Prisma, Tailwind CSS, Stripe Checkout/webhooks, Resend email, and signed cookie admin auth.

The app supports customer bookings with deposit checkout, admin service and schedule management, remaining balance collection, customer manage links, cancellation/refund behavior, and booking event auditing.

## Required First Steps

- Inspect relevant files before editing. Do not assume behavior from names alone.
- Read `README.md` before making setup, workflow, deployment, env, payment, booking, auth, or schema changes.
- Check `prisma/schema.prisma` and relevant migrations before changing booking, payment, archive, or scheduling logic.
- Check `src/lib/env.ts` and `.env.example` before adding or changing environment variables.

## Documentation Requirement

Documentation must follow code changes. Any change that affects behavior, setup, environment variables, commands, deployment, database schema, user flows, admin flows, payments, emails, auth, security assumptions, or operational behavior must update documentation in the same change.

Update these files when relevant:

- `README.md` for developer setup, architecture, workflows, deployment, behavior, and operational notes.
- `.env.example` for every environment variable addition, rename, removal, default change, or format change.
- `AGENTS.md` for AI-specific conventions, commands, invariants, or workflow changes.
- Prisma migrations and schema comments or README schema sections when database behavior changes.
- `docs/issues/` for known-but-deferred work: numbered markdown files (`000N-slug.md`) with a Status line, verified findings, a resolution plan, and acceptance criteria, written so a future contributor or agent can pick them up cold. Check this directory for relevant open issues before starting related work, and flip an issue's Status to Resolved when a change completes it.

If no documentation update is needed, say why in the final response or pull request notes.

## Important Invariants

- Do not weaken double-booking protections. Booking overlap safety relies on slot filtering, a pre-insert recheck, expired-hold cleanup inside the booking transaction, a serializable transaction, and a PostgreSQL exclusion constraint.
- Do not let admin reschedules bypass overlap validation. `updateBookingAction` in `src/server/actions/admin.ts` must call `findOverlappingActiveBooking` (`src/lib/booking.ts`, excluding the booking being moved) before applying a new `startAt`/`endAt` and return a readable error instead of writing when it collides. The `booking_no_overlap` exclusion constraint stays authoritative: keep the `booking.update` wrapped so a Prisma known/unknown request error on a reschedule maps to the same friendly message, and never let a raw constraint error reach the admin screen. `findOverlappingActiveBooking` must keep the same active-conflict definition as `createHeldBooking`.
- Keep hold, Stripe session, and database lifetimes aligned. The deposit Checkout session `expires_at` must match the booking `paymentExpiresAt` (35 minutes), and expired `PENDING_PAYMENT` holds must be released (via webhook reconciliation or lazy cleanup) rather than left blocking the exclusion constraint.
- Anchor all scheduling math and customer-facing time display to the business time zone helpers in `src/lib/business-time.ts`. Never parse or format appointment times with server-local `Date` semantics; the app must behave identically on a UTC host.
- Do not treat visible availability as authoritative by itself. Booking creation must revalidate server-side.
- Do not mark balance payment completion as service completion. Balance checkout sets payment state to paid, not booking status to completed.
- Treat Stripe reconciliation as shared behavior between webhooks, the confirmation page's automatic poll, and the scheduled sweeper (`src/lib/booking-sweeper.ts`, run by the Railway cron service via `npm run sweep`). All three funnel through `reconcileCheckoutSession`; do not add a fourth path that mutates payment state directly.
- Customers never get accounts, usernames, or passwords. Magic links are the entire customer auth surface by explicit design; do not introduce customer login flows.
- Keep Checkout restricted to instant payment methods (`payment_method_types: ["card"]` on both deposit and balance session creation). Deferred methods settle over days and break the 35-minute hold model. The webhook's `checkout.session.async_payment_failed` handler (`reconcileAsyncPaymentFailure`) exists because a failed async payment leaves the session `complete`/`unpaid` — a state the normal reconciler treats as a no-op and that never emits `checkout.session.expired`.
- Keep the deposit recovery email single-send and correctly scoped. `ensureDepositRecoveryEmail` must only fire for `CANCELLED` + `FAILED` bookings (the `shouldSendDepositRecoveryEmail` predicate — the pair every expiry path writes and no paid cancellation does) and must claim `recoveryEmailSentAt` with a conditional `updateMany` before sending, releasing the claim on failure, exactly like the manage-link email. The reconciler's expired-deposit branch must attempt it on both the state-changing and already-cancelled paths, because lazy hold cleanup cancels holds outside the reconciler.
- The confirmation page must not expose Stripe or the manage URL through its poll loop. `/api/booking/confirmation-status` is a DB-only read returning a state string; Stripe re-checks happen only through the debounced `pollConfirmationReconcileAction`; the manage URL renders exclusively server-side.
- Do not log, persist, or expose raw customer manage tokens beyond the intended emailed/manage URLs.
- Manage links are HMAC-signed tokens validated against booking token version and rotation timestamp. The pure sign/verify lives in `src/lib/manage-token.ts` (no DB/env/email); `booking-management.ts` wraps it with the booking row and `getEnv().manageLinkSecret`. Keep the secret out of the pure module (pass it in) so the token logic stays unit-testable.
- The pure Stripe reconciliation predicates live in `src/lib/stripe-reconciliation-decisions.ts` (deposit/balance × completed/expired, plus session-metadata getters). `stripe-reconciliation.ts` owns all DB reads/writes and event creation and must call these helpers rather than re-inlining the decision logic, so the decision table stays covered by `stripe-reconciliation-decisions.test.ts`.
- Preserve token rotation semantics. Resending a manage link invalidates earlier links.
- Preserve cancellation rules: automatic refund only at least 24 hours before appointment; inside 24 hours requires manual/admin refund handling.
- Preserve admin authorization checks in server actions that mutate protected data. Every mutating action in `src/server/actions/admin.ts` must begin with `requireAdmin()`; middleware cookie presence is not an authorization boundary for actions.
- `ADMIN_SESSION_SECRET` and `MANAGE_LINK_SECRET` fail closed in production: `src/lib/env.ts` throws when either is missing, shorter than 32 characters, or a placeholder value, and both deploy scripts validate them. Do not reintroduce silent fallbacks outside local development.
- Keep email behavior aligned with payment, manage-link, cancellation, and refund state changes.
- Treat the initial manage-link email as a best-effort side effect of Stripe reconciliation. Payment state must be committed before the email, and the send must be wrapped so a Resend failure is logged (with the booking id) but never propagates out of `reconcileCheckoutSession` / the webhook. Reconciliation must return success on email failure so Stripe does not retry indefinitely.
- Keep the initial manage-link email single-send under concurrency. `ensureInitialManageBookingEmail` claims `manageLinkSentAt` with a conditional `updateMany` (`where: { manageLinkSentAt: null }`) before sending and only sends when the claim wins; a failed send must release the claim. Do not revert to reading-then-sending, which allows duplicate emails when the webhook and confirmation-page reconcile run concurrently.
- Do not let unresolved bookings age out of the admin dashboard by date. `getAdminBookings` in `src/lib/booking.ts` must keep a booking on the active list until it is terminal *and* payment-settled (or archived). Past `CONFIRMED` bookings, any `PARTIALLY_PAID` booking, and completed paid bookings inside the refund window stay visible so balance collection, completion, and refund actions remain reachable after the appointment date.
- Keep admin login constant-time and rate limited. `loginAdminAction` must consult the `src/lib/rate-limit.ts` limiter (per IP and per email) before the bcrypt comparison and reject over-limit sources with a generic message, and every failure path (unknown email, inactive account, wrong password) must run exactly one bcrypt comparison — against `DUMMY_PASSWORD_HASH` when the email has no admin — so response timing cannot enumerate admin emails. Do not short-circuit before the comparison for a missing/inactive user.
- Do not remove the rate limiting on public entry points. `/api/availability` and `createBookingCheckoutAction` must consume the shared limiter; the booking-checkout limit is checked before a hold and Stripe session are created. Limiter state is in-process and per-instance by design; document that when changing hosting assumptions.
- Do not let production seed the default admin password. `prisma/seed.ts` must throw in production when `SEED_ADMIN_PASSWORD` is unset or equals the documented default, so a public deploy cannot bootstrap the known credentials.
- Surface expected admin action outcomes as returned state, not thrown errors. Admin mutations in `src/server/actions/admin.ts` return the shared `AdminActionState` (`{ error?, success? }`) and their forms render it via `useActionState`, because Next.js redacts thrown server-action messages in production. Validation and precondition failures (bad input, wrong booking state, missing Stripe references, etc.) must `return { error }`; only genuinely unexpected failures (DB outage, Stripe not returning a link) may `throw`, and those are caught by the `/admin` error boundary at `src/app/admin/error.tsx`. Do not revert these actions to `throw new Error(...)` for expected outcomes or remove the error boundary.
- Coerce a missing form `id` to `undefined` before schema parsing in every admin save action. The create forms (`service-form.tsx`, `availability-rule-form.tsx`, `blackout-form.tsx`) render no `id` input on the create path, so `formData.get("id")` returns `null`; the `id` schemas use `z.string().optional()`, which accepts `undefined` but rejects `null` under Zod v4. `saveServiceAction`, `saveAvailabilityRuleAction`, and `saveBlackoutAction` must all derive `id` as `typeof idValue === "string" && idValue.length > 0 ? idValue : undefined` before calling `safeParse`. Do not pass `formData.get("id")` straight into a schema's `id` field.

## Common Commands

Install dependencies:

```bash
npm install
```

Start local development:

```bash
npm run dev
```

Generate Prisma client:

```bash
npm run prisma:generate
```

Apply local development migrations:

```bash
npm run prisma:dev
```

Apply deploy-style migrations:

```bash
npm run prisma:migrate
```

Seed default data:

```bash
npm run prisma:seed
```

Run lint:

```bash
npm run lint
```

Run tests:

```bash
npm test
```

Build app:

```bash
npm run build
```

Run the booking sweeper once (also the Railway cron service's job, via `sh ./scripts/sweep.sh`):

```bash
npm run sweep
```

Start Docker Compose development stack:

```bash
docker compose up --build
```

Start Stripe CLI helper through Compose:

```bash
docker compose --profile stripe up stripe-cli
```

## Testing

`npm test` runs `scripts/run-tests.mjs`, which discovers **every** `src/**/*.test.ts` file and runs each in its own `node --experimental-strip-types` child process, failing if any file fails. `scripts/test-resolve-hook.mjs` (loaded via `--import`) teaches Node the `@/*` path alias and extensionless imports so tests can import app modules without a bundler. To add a test, drop a new `*.test.ts` anywhere under `src/`; it is picked up automatically. There is no orphaned test file — `utils.test.ts`, `validators.test.ts`, and the rest all run.

Tests favor pure logic. Extract pure helpers when a payment/booking rule is worth testing rather than reaching for a database: `manage-token.ts` (token sign/verify) and `stripe-reconciliation-decisions.ts` (reconciliation predicates) were split out of their DB-bound modules for exactly this. DB-dependent paths (the `createHeldBooking` race, exclusion-constraint rejection, reconciliation persistence/events) still need a real Postgres and remain a follow-up for an integration harness — do not fake Prisma to assert them.

## Key Files

- `src/components/booking/booking-form.tsx`: booking UI and slot lookup behavior.
- `src/lib/booking.ts`: slot lookup queries, held booking creation, expired-hold release, and overlap protection.
- `src/lib/booking-slots.ts`: pure business-time-zone slot computation shared by slot lookup and tests.
- `src/lib/business-time.ts`: business time zone constant, formatters, parser, and business-day helpers.
- `src/server/actions/booking.ts`: customer booking checkout, cancellation, manage-link resend, and the debounced confirmation-poll reconcile action.
- `src/lib/booking-sweeper.ts` / `scripts/sweep-stuck-bookings.ts` / `scripts/sweep.sh`: scheduled reconciliation sweeper phases, cron entry script, and Railway cron start command.
- `src/app/booking/confirmation/confirmation-finalizer.tsx` / `src/app/api/booking/confirmation-status/route.ts`: confirmation-page poll loop and its DB-only status endpoint.
- `src/app/api/availability/route.ts`: public availability API.
- `src/app/api/stripe/webhook/route.ts`: Stripe webhook entry point.
- `src/lib/stripe-reconciliation.ts`: deposit and balance checkout reconciliation (DB reads/writes + events).
- `src/lib/stripe-reconciliation-decisions.ts`: pure reconciliation decision predicates and session-metadata getters used by the reconciler and its decision-table tests.
- `src/lib/booking-management.ts`: manage-link rotation, customer booking lookup, and customer booking emails.
- `src/lib/manage-token.ts`: pure HMAC manage-link token sign/verify (secret passed in).
- `src/lib/balance-payment.ts`: remaining balance payment request email flow.
- `src/server/actions/admin.ts`: admin mutations for services, availability, blackouts (create/edit via `saveBlackoutAction`, remove via `deactivateBlackoutAction`), bookings, balance requests, archives, and refunds. All return the shared `AdminActionState` (`{ error?, success? }`) for expected outcomes so validation/precondition messages render inline via `useActionState`; only unexpected failures throw. Blackout datetime fields are parsed with `parseBusinessDateTimeLocalValue` (business time zone). `saveServiceAction`, `saveAvailabilityRuleAction`, and `saveBlackoutAction` all coerce a missing `id` (`formData.get("id")` returns `null` on the create path) to `undefined` before parsing, since the schemas' `id: z.string().optional()` rejects `null` under Zod v4.
- `src/components/admin/booking-update-form.tsx`: client form for admin booking status/reschedule/notes updates; renders `updateBookingAction` error/success state inline.
- `src/components/admin/service-form.tsx`, `availability-rule-form.tsx`, `blackout-form.tsx`, `blackout-remove-button.tsx`, `admin-action-form.tsx`: client forms/wrappers that render their admin action's `AdminActionState` result inline via the shared `action-messages.tsx` banner. `blackout-form.tsx` is both the create and per-row edit form.
- `src/app/admin/error.tsx`: `/admin` segment error boundary for genuinely unexpected server-action failures.
- `src/lib/auth.ts`: admin session cookie and authorization helpers.
- `src/lib/rate-limit.ts`: in-memory fixed-window rate limiter and shared `RATE_LIMITS` presets.
- `src/lib/request-ip.ts`: client IP resolution for rate limiting (route handlers and server actions).
- `src/lib/env.ts`: environment variable access.
- `prisma.config.ts`: Prisma v7 CLI configuration for schema, migrations, seed, and database URLs.
- `prisma/schema.prisma`: Prisma data model and enums.
- `src/generated/prisma/`: generated Prisma v7 client output. Do not edit by hand.
- `prisma/migrations/`: database migration history and constraints.
- `prisma/seed.ts`: bootstrap services, availability, and admin user.

## Environment Variables

- Keep `.env.example` synchronized with `src/lib/env.ts`, deployment scripts, Docker Compose, README instructions, and any new runtime configuration.
- Do not commit real secrets.
- Use strong values for `ADMIN_SESSION_SECRET` and `MANAGE_LINK_SECRET` outside local development.
- `NEXT_PUBLIC_*` variables are exposed to client code. Do not place secrets in them.

## Database And Prisma Guidance

- Use migrations for schema changes. Do not rely on manual database edits.
- Check existing migrations before modifying constraints or enum behavior.
- If changing booking overlap semantics, update app logic and database constraints together.
- If adding required seed/bootstrap data, update `prisma/seed.ts`, deployment notes, and README setup instructions.

## Payment And Email Guidance

- Stripe Checkout sessions must include enough metadata for reconciliation.
- Keep webhook and confirmation-page reconciliation behavior consistent by using shared reconciliation code.
- When adding email-triggering behavior, consider duplicate sends, idempotency, and state transitions.
- Reconciliation-triggered emails must be best-effort and single-send: log-and-continue on failure, and claim the send atomically before delivering (see the manage-link invariant above).
- For local webhook testing, use the Compose `stripe-cli` profile and update `STRIPE_WEBHOOK_SECRET` from the current listener output.

## UI Styling Guidance

- Keep fonts, colors, and palettes token-driven through `src/app/globals.css`; do not hard-code brand-specific values in components unless explicitly requested.
- Public and customer-facing pages should feel connected and flowing. Prefer section rhythm, soft bands, and low-contrast surfaces over repeated standalone cards.
- Prefer shared primitives such as `flow-page`, `flow-section`, `soft-band`, `soft-surface`, `surface-block`, `eyebrow`, and `page-title` for new UI work.
- Do not default to wrapping every content group in `panel`. Use card-like containment only when it has a functional purpose, such as forms, payment summaries, warnings, errors, manage-link details, or security-sensitive actions.
- Admin screens should share the same visual language as the rest of the application, including the admin login page. Keep admin workflows scannable while using the same soft surfaces, page rhythm, rounded navigation, and token-driven palette as public pages.
- Preserve stable button interactions. Buttons should provide color/state feedback without hover movement that makes controls feel jumpy.

## Final Response Expectations

When finishing a change, include:

- Files changed.
- Verification commands run and their results.
- Any checks not run and why.
- Documentation updates made, or why none were needed.

<!-- BEGIN:nextjs-agent-rules -->
 
# Next.js: ALWAYS read docs before coding
 
Before any Next.js work:
1. Read `node_modules/next/dist/docs` as a directory.
2. Navigate by reading subdirectories, usually `01-app`.
3. Use Grep only after confirming the docs directory exists.
4. Do not rely on Glob alone to determine whether local Next docs are present.

If `node_modules` is missing, it's likely that the project's dependencies need to be installed before proceeding.

Your training data is outdated — the docs are the source of truth.
 
<!-- END:nextjs-agent-rules -->
