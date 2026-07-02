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

If no documentation update is needed, say why in the final response or pull request notes.

## Important Invariants

- Do not weaken double-booking protections. Booking overlap safety relies on slot filtering, a pre-insert recheck, a serializable transaction, and a PostgreSQL exclusion constraint.
- Do not treat visible availability as authoritative by itself. Booking creation must revalidate server-side.
- Do not mark balance payment completion as service completion. Balance checkout sets payment state to paid, not booking status to completed.
- Treat Stripe reconciliation as shared behavior between webhooks and confirmation-page fallback.
- Do not log, persist, or expose raw customer manage tokens beyond the intended emailed/manage URLs.
- Manage links are HMAC-signed tokens validated against booking token version and rotation timestamp.
- Preserve token rotation semantics. Resending a manage link invalidates earlier links.
- Preserve cancellation rules: automatic refund only at least 24 hours before appointment; inside 24 hours requires manual/admin refund handling.
- Preserve admin authorization checks in server actions that mutate protected data.
- Keep email behavior aligned with payment, manage-link, cancellation, and refund state changes.

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

Start Docker Compose development stack:

```bash
docker compose up --build
```

Start Stripe CLI helper through Compose:

```bash
docker compose --profile stripe up stripe-cli
```

## Current Test Caveat

`npm test` currently runs `src/lib/booking-prefill.test.ts`. There is also `src/lib/utils.test.ts`, but it is not currently included in the package `test` script.

## Key Files

- `src/components/booking/booking-form.tsx`: booking UI and slot lookup behavior.
- `src/lib/booking.ts`: slot generation, held booking creation, and overlap protection.
- `src/server/actions/booking.ts`: customer booking checkout, cancellation, manage-link resend, and confirmation reconciliation actions.
- `src/app/api/availability/route.ts`: public availability API.
- `src/app/api/stripe/webhook/route.ts`: Stripe webhook entry point.
- `src/lib/stripe-reconciliation.ts`: deposit and balance checkout reconciliation.
- `src/lib/booking-management.ts`: manage-link token signing, verification, rotation, and customer booking emails.
- `src/lib/balance-payment.ts`: remaining balance payment request email flow.
- `src/server/actions/admin.ts`: admin mutations for services, availability, blackouts, bookings, balance requests, archives, and refunds.
- `src/lib/auth.ts`: admin session cookie and authorization helpers.
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
