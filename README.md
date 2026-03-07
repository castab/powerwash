# Powerwash Booking

Production-oriented mobile-first car wash booking application built with Next.js App Router, TypeScript, PostgreSQL, Prisma, Tailwind CSS, Stripe, and Railway deployment conventions.

## Stack

- Next.js App Router
- TypeScript
- PostgreSQL
- Prisma ORM
- Tailwind CSS
- Stripe Checkout + webhook
- Signed cookie admin auth with `jose`

## Project Structure

```text
.
|- prisma/
|  |- migrations/0001_init/migration.sql
|  |- schema.prisma
|  `- seed.ts
|- src/
|  |- app/
|  |  |- admin/
|  |  |- api/
|  |  |- book/
|  |  `- booking/
|  |- components/
|  |  |- admin/
|  |  |- booking/
|  |  |- home/
|  |  `- layout/
|  |- lib/
|  `- server/actions/
|- middleware.ts
`- .env.example
```

## Features

- Customer-facing booking flow
- Service browsing and live slot lookup
- Deposit-only Stripe checkout
- Stripe webhook confirmation
- Remaining balance tracked as due in person
- Admin dashboard for services, weekly availability, blackout dates, and bookings
- Database-level overlap protection using a PostgreSQL exclusion constraint
- Business-logic overlap validation using serializable transactions
- Seed data for services, weekly rules, and an admin account
- PWA manifest

## Database Schema

Main models:

- `Service`: fixed duration, base price, deposit, active flag
- `Customer`: contact details
- `Vehicle`: make, model, year, plate, color
- `Booking`: appointment time range, payment status, Stripe references, balance due
- `AvailabilityRule`: recurring weekly hours
- `BlackoutDate`: one-off blocked windows
- `AdminUser`: dashboard login

The migration adds:

- PostgreSQL enums for booking and payment status
- indexes for schedule and admin queries
- `booking_valid_range` check constraint
- `booking_no_overlap` exclusion constraint using `tstzrange`

## Local Setup

1. Copy `.env.example` to `.env`.
2. Create a PostgreSQL database.
3. Fill in environment variables.
4. Install dependencies:

```bash
npm install
```

5. Apply migrations:

```bash
npm run prisma:dev
```

For existing databases in production-like environments use:

```bash
npm run prisma:migrate
```

6. Seed data:

```bash
npm run prisma:seed
```

7. Start development:

```bash
npm run dev
```

## Docker Compose Development

This repo includes a local development compose setup in [docker-compose.yml](h:\GitHub\powerwash\docker-compose.yml).

What it does:

- Runs PostgreSQL 18 on `localhost:5432`
- Runs the Next.js app on `http://localhost:3000`
- Mounts the repo into the app container for live reload
- Overrides `DATABASE_URL` and `DIRECT_URL` inside the app container to use the Compose service host `db`
- Runs `prisma migrate deploy` automatically before starting the dev server
- Runs the Prisma seed script automatically so the default admin account exists
- Uses webpack dev mode in Docker because file watching is more reliable than Turbopack on Windows bind mounts

Before first run:

1. Copy `.env.example` to `.env`.
2. Set at least:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `ADMIN_SESSION_SECRET`
3. Leave the database URLs in `.env` as-is if you also want to run the app on the host. Compose overrides them automatically for the containerized app.

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

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Prisma pooled PostgreSQL connection string |
| `DIRECT_URL` | Recommended | Direct PostgreSQL connection for Prisma migrations on Railway |
| `STRIPE_SECRET_KEY` | Yes for payments | Stripe secret API key |
| `STRIPE_WEBHOOK_SECRET` | Yes for webhook | Stripe signing secret for `/api/stripe/webhook` |
| `NEXT_PUBLIC_APP_URL` | Yes | Public base URL used in Stripe success and cancel URLs |
| `ADMIN_SESSION_SECRET` | Yes | Secret used to sign admin session cookies |
| `SEED_ADMIN_EMAIL` | Optional | Seed admin login email |
| `SEED_ADMIN_PASSWORD` | Optional | Seed admin login password |

## Stripe Setup

1. Stripe Checkout uses inline `price_data`, so no catalog product setup is required.
2. Set `STRIPE_SECRET_KEY`.
3. Add a webhook endpoint:

```text
https://your-domain.com/api/stripe/webhook
```

4. Subscribe to:
   - `checkout.session.completed`
   - `checkout.session.expired`
5. Set `STRIPE_WEBHOOK_SECRET`.

## Railway Deployment

Recommended Railway setup:

1. Create a new Railway project.
2. Add a PostgreSQL service.
3. Deploy this app service from the repo.
4. Set the app environment variables from the table above.
5. Map:
   - `DATABASE_URL` to Railway PostgreSQL `DATABASE_URL`
   - `DIRECT_URL` to Railway PostgreSQL `DATABASE_PRIVATE_URL` if available, otherwise `DATABASE_URL`
6. Configure the build and start commands:

```text
Build: npm install && npm run build
Start: npm run start
```

7. Run migrations during deployment:

```text
npm run prisma:migrate
```

8. Seed once after the first successful deployment:

```text
npm run prisma:seed
```

## Admin Auth

- Admin users are stored in PostgreSQL with bcrypt password hashes.
- Login issues a signed HTTP-only cookie.
- `middleware.ts` protects `/admin/*`.
- Seeded credentials come from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`.

## Booking Flow

1. Customer browses active services on `/`.
2. Customer books on `/book`.
3. Available slots are generated from active weekly availability, blackout dates, and future bookings.
4. Booking is created in `PENDING_PAYMENT` state with a short payment hold.
5. Stripe Checkout collects only the deposit.
6. Stripe webhook marks the booking `CONFIRMED` and payment `PAID`.
7. Remaining balance stays recorded on the booking as `balanceDue`.

## Notes

- Currency values are stored as integer cents.
- The current implementation assumes a single service bay. If the business later needs multiple simultaneous bays, add a resource dimension to `Booking` and the exclusion constraint.
- PWA support is intentionally minimal to keep the core booking flow prioritized.
