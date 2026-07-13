---
name: verify
description: How to build, run, and drive this app locally to verify changes end-to-end (booking flow, admin, service-area checks).
---

# Verifying powerwash locally

## Launch

The compose stack normally runs everything (`docker compose up`), but for iterating it's faster to run only postgres in docker and Next on the host:

```bash
docker compose up -d db          # reuses the powerwash_postgres_data volume
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/powerwash?schema=public" \
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/powerwash?schema=public" \
npm run dev                      # .env.local has host `db`, so override to localhost
```

App: http://localhost:3000 — booking wizard at `/book`, admin at `/admin`.

## Driving the booking flow (Playwright)

Install `playwright` in the scratchpad (browsers are already in `%LOCALAPPDATA%\ms-playwright`). Key selectors: `#address`, `#address-listbox [role=option]`, `button "Continue"`, submit `button "Continue to deposit payment"`.

**Gotchas that will burn time:**

- **Google browser key is referer-blocked on `http://localhost:3000`** (`API_KEY_HTTP_REFERRER_BLOCKED`), so real Places autocomplete returns 403 in local dev. Stub the Maps JS instead: `page.route("https://maps.googleapis.com/maps/api/js*", ...)` and fulfill with a script that defines `window.google.maps.importLibrary` returning fake `AutocompleteSuggestion` / `AutocompleteSessionToken` classes, then invokes the `callback=` query param. Use **real place IDs** in the stub so server-side Routes/Places calls still run for real.
- **Server key (`GOOGLE_MAPS_SERVER_API_KEY`) allows Routes API but blocks Places API** (`API_KEY_SERVICE_BLOCKED` as of 2026-07). Anything hitting `places.googleapis.com` server-side fails until the key's API restrictions allow Places API (New).
- **Turnstile** uses a real site key and won't auto-solve for scripted browsers. Restart the dev server with `NEXT_PUBLIC_TURNSTILE_SITE_KEY= TURNSTILE_SECRET_KEY=` (set-but-empty, use bash not PowerShell) to disable it on both sides.
- **Booking form token enforces a 3s minimum fill time** — a submit faster than 3s after page render gets a feigned success (bot deterrent). Playwright flows are naturally slower, but don't shortcut straight to submit.
- The **dev-prefill button** ("Dev Only: Use Sample Data") wipes the address field and its verified metadata — fill vehicle/contact fields directly instead.
- Known in-area verified address in the dev DB (also the business origin, 0 min drive): `991 Deerhorn Dr W, Madera, CA 93636, USA`, placeId `ChIJZRRrTiJqlIARnkcOcR-W3go`. Service area: 30 min from Madera.

## Inspecting the DB

```bash
node --experimental-strip-types --import ./scripts/test-resolve-hook.mjs \
  --env-file=.env.local --input-type=module -e "
process.env.DATABASE_URL='postgresql://postgres:postgres@localhost:5432/powerwash?schema=public';
const { prisma } = await import('./src/lib/prisma.ts');
/* ...queries... */ await prisma.\$disconnect();"
```

(The raw generated client requires constructor options in Prisma 7 — always import `src/lib/prisma.ts` instead, with the resolve hook for `@/` paths.)

Successful checkout submits create a `PENDING_PAYMENT` hold + a Stripe test checkout session; holds expire on their own and the sweeper releases them.
