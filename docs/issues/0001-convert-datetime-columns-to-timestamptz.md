# Convert all `DateTime` columns from `timestamp(3)` to `timestamptz(3)`

- **Status:** Open
- **Priority:** Low (hardening; no active defect)
- **Filed:** 2026-07-09
- **Scope:** One Prisma migration + schema annotations. No application-logic changes expected.

## Problem

Every `DateTime` field in `prisma/schema.prisma` maps to PostgreSQL `timestamp(3)` **without time zone** — Prisma's default mapping. That includes all booking lifecycle timestamps (`startAt`, `endAt`, `paymentExpiresAt`, `confirmedAt`, `cancelledAt`, `manageLinkSentAt`, `recoveryEmailSentAt`, `balanceRequestedAt`, `balancePaidAt`, `refundedAt`, `archivedAt`, `customerAccessEndsAt`, every `createdAt`/`updatedAt`, etc.), across all migrations from `0001_init` onward.

The stored values are UTC **by convention only**: the Prisma client always writes `DateTime` as UTC and always reads it back as UTC, so nothing states in the schema itself that these naive timestamps are UTC instants. The convention is tribal knowledge, not enforced by the type system.

## Why it is currently safe (verified 2026-07-09)

These findings bound the risk — re-verify them before starting, since any of them changing raises the priority of this issue:

1. **No raw SQL anywhere.** `$queryRaw` / `$executeRaw` / `queryRawUnsafe` appear nowhere in the codebase. Every read/write goes through the Prisma client, so both sides of every comparison share the UTC convention.
2. **Column-vs-column comparisons are conversion-free.** The `booking_no_overlap` exclusion constraint compares `startAt`/`endAt` against each other — both naive, both UTC, no timezone conversion involved.
3. **Display is timezone-anchored in code.** Customer-facing times are rendered via the business-time helpers in `src/lib/business-time.ts` (`America/Los_Angeles`), never via server or database timezone.
4. **`@default(now())` is filled client-side by Prisma**, so the `DEFAULT CURRENT_TIMESTAMP` clauses in the DDL are not actually relied on by the app (see risk 3 below for why they are still a hazard).
5. **Single consumer.** No BI tool, reporting job, or second service reads this database.

## Where it would bite (the reasons to fix it)

1. **Future raw SQL comparing these columns to `now()`**: `now()` returns `timestamptz`; mixing it with a naive `timestamp` converts using the *session* `timezone` setting. Classic silent-skew footgun.
2. **Any future non-Prisma consumer** must be told "these are UTC" out of band — the column type doesn't say so.
3. **The `DEFAULT CURRENT_TIMESTAMP` DDL defaults**: a non-Prisma writer inserting rows on a non-UTC session would store local wall-clock time next to UTC values from Prisma — silent, hard-to-detect skew.
4. **Humans in psql** read naive values with no timezone marker and guess wrong.

`timestamptz` eliminates all four: it is stored as the same 8-byte UTC instant internally (it does **not** store a timezone), but Postgres then handles session-timezone conversion explicitly and unambiguously at the boundaries.

## Resolution plan

Do this as **one dedicated migration converting every `DateTime` column at once**. Do not convert piecemeal — a schema with mixed `timestamp`/`timestamptz` semantics is worse than either convention.

### 1. Annotate the Prisma schema

Add `@db.Timestamptz(3)` to **every** `DateTime` field in `prisma/schema.prisma`, e.g.:

```prisma
startAt             DateTime  @db.Timestamptz(3)
paymentExpiresAt    DateTime? @db.Timestamptz(3)
createdAt           DateTime  @default(now()) @db.Timestamptz(3)
```

Models to cover: `Service`, `Booking`, `BookingEvent`, `AvailabilityRule`, `BlackoutDate`, `AdminUser`. Grep the schema for `DateTime` to enumerate — do not work from this issue's (possibly stale) field list.

### 2. Write the migration by hand

Migrations in this repo are hand-written numbered SQL directories (`prisma/migrations/000N_name/migration.sql`). For each column:

```sql
ALTER TABLE "Booking"
  ALTER COLUMN "startAt" TYPE timestamptz(3) USING "startAt" AT TIME ZONE 'UTC';
```

The `USING "col" AT TIME ZONE 'UTC'` clause is **the critical part**: it pins the reinterpretation to the UTC convention that has been in effect, so stored instants do not shift. Omitting it makes Postgres reinterpret via the session timezone — data corruption if that session is not UTC.

Notes:

- `ALTER COLUMN TYPE` on these tables takes an `ACCESS EXCLUSIVE` lock and rewrites the table. At this project's row counts that is milliseconds; if the tables ever grow large, schedule accordingly.
- The `booking_no_overlap` exclusion constraint on `Booking(startAt, endAt)` ranges: verify whether Postgres requires dropping/recreating it around the column type change (test on a scratch database; the migration must handle it explicitly if so).
- The `DEFAULT CURRENT_TIMESTAMP` clauses on `createdAt` columns remain valid (`CURRENT_TIMESTAMP` is already `timestamptz`) — no change needed, and the risk-3 hazard disappears once the column type matches.

### 3. Verify

- `npm run prisma:generate && npm test && npm run lint && npm run build`.
- Apply against a local Postgres that has pre-existing rows written *before* the migration (e.g. seed + a test booking first): confirm stored instants are unchanged by comparing a known booking's `startAt` epoch value before/after.
- Exercise a real flow end-to-end (book → pay via Stripe test mode → confirm) to prove booking-hour math, slot availability, and the exclusion constraint still behave — especially around DST boundaries, which `src/lib/utils.test.ts` and `booking-slots.test.ts` cover in unit form.
- Confirm the Prisma client returns identical `Date` values for a row read before vs. after conversion.

### 4. Documentation

Per the repo Documentation Policy: update the README schema/operational notes (state that all timestamps are `timestamptz` and why) and `AGENTS.md` if any invariant wording references timestamp semantics. Close this issue file by flipping **Status** to Resolved with the migration number.

## Acceptance criteria

- Every `DateTime` column in the database is `timestamptz(3)`; no naive `timestamp` columns remain.
- No stored instant shifted (epoch-equality spot check on pre-existing rows).
- Full test suite, lint, and build pass; a real booking flow works end-to-end.
- README/AGENTS.md updated.
