# Migrate address autocomplete and service-area checking from Google APIs to Mapbox

- **Status:** **Rejected (2026-07-13)** — kept as a reference spec; see [Decision](#decision-rejected-2026-07-13) below. Do not schedule without a new gain vector (Mapbox pricing/terms change, or an unrelated need for Mapbox's broader map/tile platform).
- **Filed:** 2026-07-12
- **Scope (as proposed):** Introduce a geo-provider abstraction layer with Google (current, default) and Mapbox implementations, selectable via env config. Additive schema change. No behavior change while `google` remains the active provider.
- **Prerequisites (human):** Mapbox account; a public (`pk.`) token with URL restrictions for the browser and a separate server token; a pricing comparison against current Google spend (Autofill sessions + permanent geocodes + Directions requests vs. Places sessions + Place Details + Routes Essentials).

## Decision: Rejected (2026-07-13)

Researched all the way through the storage/legal question before writing any code, and the migration does not clear the bar — no material technical or financial gain, and one real financial loss. Rest of this document is preserved as a fully worked reference (API mapping, architecture, phased plan) in case the deciding facts change later.

**Why rejected:**

1. **No technical gain that matters.** The one structural difference — Mapbox's "verification by re-geocode" vs. Google's "verification by ID lookup" (see [The verification semantic shift](#the-verification-semantic-shift)) — is a wash at best and a downgrade at worst: it trades a stable place-ID lookup for a confidence-scored re-geocode that can reject addresses Google would have accepted. Everything else (autocomplete UX, drive-time gating logic, session billing shape) is equivalent between providers.
2. **Financial loss, not gain, on the specific capability this app needs.** This app must retain a customer's service address at least until the booking is fulfilled (routinely weeks out) and reuse it for repeat customers — i.e., it needs real storage rights, not session-scoped lookups. See [Storage feasibility analysis](#storage-feasibility-analysis-2026-07-13--the-deciding-factor) for the full comparison, but in short:
   - **Google** already grants everything this app actually needs at **no additional cost**: `place_id` is storable indefinitely, and the Autocomplete-selected address text has its own exception — combined with re-deriving coordinates on demand (see remediation below), Google's existing self-serve pricing covers the requirement.
   - **Mapbox's equivalent guarantee costs money and isn't self-serve.** Its free/default tier is explicitly session-only (no grace period at all, unlike Google's 30-day cache). Getting Mapbox to a place where it can legally back this app's core "remember the address until service day" requirement means the **permanent** geocoding tier: no free allowance, **$5.00/1,000 requests (1–500k)** vs. Google's comparable spend, and it requires **contacting Mapbox sales** rather than self-serve signup.
   - Net: migrating would mean paying more, for a legally narrower guarantee, gated behind a sales cycle, to replace something Google already lets us do for free.

**Reopen this proposal if:** Mapbox introduces a self-serve or free tier for permanent geocoding, drops its per-request permanent pricing materially, or the business independently adopts Mapbox for something that needs its map/tile platform (at which point the sales relationship and cost are already sunk and this migration's math changes).

## Research tooling for the executing agent

The Mapbox documentation MCP server was used to research this proposal and should be available when executing it. It currently lives in the repo-root `.mcp.json` (added temporarily for research purposes — **keep/add this entry** as part of taking on this work):

```json
{
  "mcpServers": {
    "mapbox-docs-mcp": {
      "command": "npx",
      "args": ["mcp-remote", "https://mcp-docs.mapbox.com/mcp"]
    }
  }
}
```

It provides `search_mapbox_docs_tool` / `get_document_tool` for authoritative, current API reference lookups. Re-verify every endpoint, parameter, and ToS claim in this proposal against those docs before implementing — this proposal was accurate as of 2026-07-12.

## Motivation

The app depends on three Google APIs with two API keys that have proven fiddly to restrict correctly (server key must allow Places/Routes; browser key referer restrictions block localhost — see README env notes). Mapbox offers equivalent capability behind a single vendor with npm-native SDKs (no injected `<script>`), simpler token semantics, and potentially better pricing. This proposal keeps Google fully working and adds Mapbox behind a provider switch, so the swap is reversible and testable side-by-side.

## Current state (Google) — verified 2026-07-12

Re-verify this inventory before starting; file paths and line anchors drift.

| Concern | Implementation | Google API |
|---|---|---|
| Address autocomplete UI (booking + admin origin) | `src/lib/google-maps-loader.ts` (script injection, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`), `src/components/address/address-autocomplete-input.tsx` (`AutocompleteSuggestion.fetchAutocompleteSuggestions` + `toPlace().fetchFields()`, session tokens, `includedRegionCodes: ["us"]`) | Maps JS SDK + Places (New) |
| Server canonical-address resolution on booking submit | `src/lib/google-places.ts` → `fetchPlaceDetails(placeId)`; called from `src/server/actions/booking.ts`; never trusts client address text | Place Details (New) REST |
| Drive-time service-area gate | `src/lib/google-routes.ts` → `computeTravelTimeSeconds(origin, dest)` (waypoints: placeId \| lat/lng \| address); decision layer in `src/lib/service-area.ts`; advisory pre-check `src/app/api/service-area/route.ts`; authoritative re-check in the booking action | Routes API `computeRoutes` |

Supporting pieces: `src/lib/validators.ts` (`bookingSchema` requires `addressPlaceId` + `addressValidated === true`), `src/lib/booking.ts` (persistence: `CustomerAddress.googlePlaceId`, `formattedAddress`, `lat`/`lng`, `rawComponents`, eligibility memo columns; matching by placeId then normalized address), `BusinessSettings` singleton (origin + `maxTravelMinutes`), `src/lib/env.ts` (`googleMapsServerApiKey` with public-key fallback), `.env.example`, `Dockerfile` (build ARG/ENV for `NEXT_PUBLIC_*`), README env table.

## API mapping (Google → Mapbox)

| Current (Google) | Replacement (Mapbox) | Notes |
|---|---|---|
| Places JS SDK autocomplete + `fetchFields` | **Address Autofill API** via `@mapbox/search-js-core`: `AddressAutofillCore.suggest()` / `.retrieve()` with `SessionToken` | npm package — no script injection, so `google-maps-loader.ts` has no Mapbox counterpart. Address-only results; options `country: "us"`, `limit`, `proximity`. Suggestions carry `mapbox_id`, `full_address`, WHATWG address components, and a `match_code`; `retrieve()` adds Point coordinates. Session-token billing shape matches Google's. |
| Place Details REST (`GET places.googleapis.com/v1/places/{placeId}`) | **Geocoding v6 forward, structured input, permanent**: `GET api.mapbox.com/search/geocode/v6/forward?address_number=…&street=…&place=…&region=…&postcode=…&country=us&types=address&autocomplete=false&permanent=true` | **Semantic shift — see below.** Response feature provides canonical `full_address`, coordinates, components, `mapbox_id`, and `match_code`. |
| Routes REST (`POST routes.googleapis.com/directions/v2:computeRoutes`, field mask `routes.duration`, `"1234s"` strings) | **Directions API**: `GET api.mapbox.com/directions/v5/mapbox/driving/{originLng},{originLat};{destLng},{destLat}?overview=false&access_token=…` → `routes[0].duration` | Duration is a plain number of seconds (no `"…s"` parsing). Use the `driving` profile, not `driving-traffic`: deterministic results match the current Routes-default behavior and keep eligibility memos stable. **Coordinates-only waypoints** — see constraint 3. |

### The verification semantic shift

Google flow: client sends `placeId` → server looks the ID up (Place Details) → guaranteed same entity; canonical data comes from the ID.

Mapbox has no permanent lookup-by-ID (Search Box/Autofill `retrieve` is temporary-use; see constraints). So the Mapbox flow is **verification-by-re-geocode**: the client submits the selected suggestion's `mapbox_id` + full address + structured components; the server forward-geocodes the *structured components* with `permanent=true` and `autocomplete=false`, then accepts only if:

1. `match_code.confidence` is `exact` or `high` (reject `medium`/`low`; treat `address_number: "plausible"`/interpolated per product taste — recommend accept-with-memo initially), and
2. the result is `types=address`, and
3. (tightening, optional) the result's `mapbox_id` equals the client-submitted one — treat mismatch as suspicious but fall back to the confidence gate, since `mapbox_id` stability across data releases is weaker than Google place-ID stability.

Failure maps onto the existing error codes: no acceptable match → `address_not_found`; API failure → `service_area_unavailable`. The existing rule "never persist or admit an address the server could not verify" is unchanged.

## Hard constraints (Mapbox ToS — encode these in code comments and README)

1. **Temporary vs. permanent storage.** All Search Box / Address Autofill API results are for **temporary use only — coordinates from `retrieve()` must not be persisted** (Mapbox ToS; the Search JS docs state coordinates "should be used ephemerally and not persisted"). This app persists canonical address + lat/lng + eligibility memos in `CustomerAddress`, so **everything persisted must come from Geocoding v6 with `permanent=true`** (priced higher per request; explicit storage rights). Client-side `retrieve()` coordinates may be used ephemerally for the advisory `/api/service-area` pre-check only.
2. **No rendering on non-Mapbox maps.** Feature suggestions must not be displayed on Google Maps / MapKit etc. The app renders no map at all — compliant, but note it in the README so a future map feature doesn't trip this.
3. **Directions waypoints are coordinates only.** No place-ID or free-text waypoints (unlike Google Routes). The travel-time interface must take lat/lng as the primary waypoint form; an address-only `BusinessSettings` origin must first resolve through a (permanent) geocode. In practice the origin is set via autocomplete and already stores `originLat`/`originLng`, so this is a fallback path.

## Storage feasibility analysis (2026-07-13) — the deciding factor

The question that actually killed this proposal: **can either provider legally back what this app needs to store?** The app must retain a customer's service address at least until the booking is fulfilled (routinely weeks out), and reuse it across a repeat customer's future bookings. That is real, indefinite-ish storage — not a single interactive session. Researched directly against Google's and Mapbox's current policy pages (search + fetch, 2026-07-13); re-verify before relying on this if much time has passed.

### What's actually restricted, field by field

| Data | Google | Mapbox |
|---|---|---|
| `place_id` / `mapbox_id` | **Exempt from caching restrictions — storable indefinitely.** ([Places API policies](https://developers.google.com/maps/documentation/places/web-service/place-id)) | No documented exemption for the ID alone; not addressed separately from the coordinates it resolves to. |
| Address text the end user selected via Autocomplete | Has its own named exception, **"Autocomplete for end user addresses"**: *"When an end user uses Autocomplete functionality within your Customer Application to type ahead a street address and that street address would have been completely and accurately provided by that end user without Autocomplete, the end user's selected address is then not subject to the Google Maps Content restrictions... This exception applies only to the street address selected by the end user and solely for that end user's specific transaction."* Covers the address text (not lat/lng or place_id) for at least the originating transaction; the "solely for that end user's specific transaction" wording does not clearly authorize reuse across a *separate future* booking — treat repeat-customer reuse of stored text as a legal gray area, not a clean green light. | Not addressed as a distinct case from coordinates in Mapbox's docs. |
| Lat/lng coordinates | **Temporary cache only, up to 30 consecutive calendar days, then must be deleted.** No paid tier extends this — Google does not sell permanent Places-content storage at all. | **Not persistable on the default tier at all** — Search JS docs state retrieved coordinates "should be used ephemerally and not persisted," with no stated grace period. Persisting coordinates for any duration requires the **permanent** Geocoding v6 tier. |

### Why this kills the migration financially, not just technically

Getting Mapbox to legally cover what this app already does today on Google requires the **permanent** tier:

| | Google (current) | Mapbox permanent (required for parity) |
|---|---|---|
| Free tier | N/A for content storage — covered by the exemptions above at zero marginal storage cost | **None** |
| Price | Places (New) Autocomplete session + Place Details, existing self-serve billing | **$5.00 / 1,000 requests (1–500k)**, $4.00/1,000 above that |
| Access | Self-serve, already integrated | **Requires contacting Mapbox sales** — not self-serve |

Google's temporary tier pricing for geocoding-like calls also undercuts this comparison further (self-serve $0.75 → $0.60 → $0.45 per 1,000 as volume grows, with a 100,000/month free allowance) — but that tier is exactly the one that's *insufficient* here, since it can't legally back indefinite storage either. The point isn't "Mapbox temporary is cheap" — it's that **the tier Mapbox requires for what this app needs is expensive, capped-free-tier-less, and sales-gated**, where Google's equivalent is already free and running.

### The actual remediation (applies today, independent of Mapbox)

The research surfaced a real gap in the **current** Google integration: `CustomerAddress.lat`/`lng` are persisted indefinitely with no purge job, which exceeds Google's stated 30-day temporary-cache window as written. The fix does not require Mapbox or a provider-abstraction layer:

- Keep persisting `googlePlaceId` (indefinite exemption) and the customer-typed address text (Autocomplete exception, at minimum for the original transaction) long-term — no change needed.
- **Stop treating stored `lat`/`lng` as long-term truth.** Re-derive coordinates on demand, close to when they're actually needed (the authoritative service-area check at booking time; again near dispatch if useful) via a fresh `fetchPlaceDetails(placeId)` call — already indefinitely storable by ID, so a just-in-time re-fetch never runs afoul of the 30-day cache rule.
- This is a small, additive change to `src/lib/booking.ts`'s existing fast-path (`findValidatedAddressByPlaceId`), not a rewrite, and is worth its own `docs/issues/` entry separate from this rejected migration.

## Target architecture: provider abstraction layer

Provider selection: `GEO_PROVIDER` (server) and `NEXT_PUBLIC_GEO_PROVIDER` (client) ∈ `google` (default) | `mapbox`. If unset, fall back to whichever provider has a configured key; if both, `google`. Client and server must agree — the booking form submits its provider and the server rejects mismatches (see Data model).

### Server: `src/lib/geo/`

```
src/lib/geo/
  provider.ts        — interface + provider selection from env
  google.ts          — thin adapter over existing google-places.ts / google-routes.ts (leave those files in place)
  mapbox-geocoding.ts — new: Geocoding v6 client (canonicalization)
  mapbox-directions.ts — new: Directions v5 client (travel time)
```

Interface (mirror the existing result-shape conventions — `ok | not_found | error`, never leak raw provider errors):

- `canonicalizeAddress(input: { providerPlaceId?: string; formattedAddress: string; components?: …; lat?: number; lng?: number }) → { status: "ok"; canonical: { formattedAddress; lat; lng; components; providerPlaceId } } | { status: "not_found" } | { status: "error" }`
  - Google impl: wraps `fetchPlaceDetails(providerPlaceId)`.
  - Mapbox impl: structured-input forward geocode with `permanent=true&autocomplete=false&country=us&types=address`, match-code gate as above. Reuse the existing patterns from `google-places.ts`: 5s timeout, 6h/500-entry in-memory TTL cache, pure exported parser for tests.
- `computeTravelTimeSeconds(origin: Waypoint, destination: Waypoint) → TravelTimeResult` where `Waypoint` is coordinates-first (`{ lat; lng }`), with optional `providerPlaceId`/`address` that the Google impl may pass natively and the Mapbox impl resolves via `canonicalizeAddress` first.
  - Mapbox impl: `directions/v5/mapbox/driving`, `overview=false`; parse `routes[0].duration` (number, seconds); empty `routes`/`NoRoute` code → `not_found`; other → `error`. Export URL builder + parser as pure functions for tests (pattern: `google-routes.ts`).

`service-area.ts`, the advisory route, and the booking action call only the `geo/provider.ts` interface. The eligibility decision layer (`decideEligibility`, memo freshness, caches) is already provider-agnostic and must not change.

### Client: suggestion-service abstraction

Extract the Google-specific internals of `address-autocomplete-input.tsx` behind a small interface:

- `createSuggestionSession() → { fetchSuggestions(input) → Suggestion[]; resolveSuggestion(s) → AddressValue; }`
- Google impl = current code (loader + `AutocompleteSuggestion`/`fetchFields`, session-token rotation after resolve).
- Mapbox impl = `AddressAutofillCore` + `SessionToken` from `@mapbox/search-js-core` (`country: "us"`, `limit` matching current UX); `resolveSuggestion` calls `retrieve()` and maps `full_address`/coordinates/components + `mapbox_id` into `AddressValue`.

The component's UX contract is preserved **exactly**: debounce cadence; any manual edit clears the provider ID/coords and sets `validated: false`; missing token = silent manual mode; load/API failure = fallback text + `manual` mode + `onModeChange`; `AddressValue` keeps its shape with `placeId` reinterpreted as "active provider's place ID" (add `provider` field).

## Data model changes (additive — no destructive migration)

New hand-written numbered migration (repo convention):

- `CustomerAddress`: add nullable `mapboxId TEXT`; keep `googlePlaceId` untouched (legacy rows keep matching). Optionally add `geoProvider TEXT` recording which provider validated the row.
- `BusinessSettings`: add nullable `originMapboxId TEXT`.
- Booking form: add hidden `addressProvider` input; `bookingSchema` gains the field; the server action rejects with `address_not_verified` when submitted provider ≠ active provider (covers forms submitted across a provider switch).
- `findMatchingAddress` / `findValidatedAddressByPlaceId` (`src/lib/booking.ts`): match on the **active provider's** ID column first, then the existing normalized-formatted-address fallback. Never downgrade a validated row (existing rule).
- **Eligibility memos**: travel durations differ between providers, so switching `GEO_PROVIDER` must invalidate memos. Simplest robust lever: fold the active provider name into the memo-freshness check alongside `settings.updatedAt` (`isEligibilityMemoFresh` in `src/lib/service-area.ts`) and into the in-memory eligibility cache key. Do not rely on a runbook step alone.

## Env & deployment

| Var | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | browser (build-time inlined) | Public `pk.` token, URL-restricted. Add to `.env.example`, README env table, and `Dockerfile` build `ARG`/`ENV` (same pattern as PR #18 for the Google key). |
| `MAPBOX_SERVER_ACCESS_TOKEN` | server runtime | Geocoding (permanent) + Directions. Fall back to the public token when unset (mirror `getEnv().googleMapsServerApiKey` in `src/lib/env.ts`). |
| `GEO_PROVIDER` / `NEXT_PUBLIC_GEO_PROVIDER` | server / browser | `google` (default) \| `mapbox`. Also a `Dockerfile` build ARG for the `NEXT_PUBLIC_` one. |

All optional: with nothing configured the address field degrades to manual mode and the service-area gate skips, exactly as today. Keep both intentionally-not-required comments in `scripts/vercel-build.mjs` / `scripts/start.sh` in sync.

## Billing notes

- Autofill `/suggest`+`/retrieve` is **session-billed** via `session_token` (a session closes on retrieve, after 180s without one, or at 50 suggests). Reuse the existing session-rotation discipline; never share a token across concurrent sessions.
- Exactly **one permanent geocode per booking submit** (mirrors today's single Place Details call), skipped on the re-booking fast path (`findValidatedAddressByPlaceId` equivalent) and cached with the existing 6h TTL pattern.
- Directions requests are per-request; the existing advisory-endpoint protections (signed form token, per-IP rate limit, memo fast path) already bound spend and carry over unchanged.

## Testing plan

Mirror the existing dependency-free `node:assert` unit-test style (no network):

- `mapbox-geocoding.test.ts`: structured-input query builder (component mapping, URL encoding, `permanent`/`autocomplete`/`types`/`country` params); response parser (well-formed → canonical value; missing coordinates/`full_address` → error); match-code gate (`exact`/`high` accepted; `medium`/`low` → not_found; non-address type → not_found).
- `mapbox-directions.test.ts`: URL builder (lng,lat ordering!); duration parse (integer + fractional); empty/missing `routes` → not_found; malformed → error.
- `geo/provider.test.ts`: env-based selection incl. fallbacks and default-to-google.
- `validators.test.ts`: `addressProvider` field accepted/required behavior; provider-mismatch rejection path in the action.
- `service-area.test.ts`: unchanged — passing as-is demonstrates the decision layer stayed provider-agnostic; add memo-invalidation-on-provider-switch cases.

## Phased execution (each phase green — `npm test`, `npm run lint`, `npm run build` — before the next)

1. **Server geo module**: `src/lib/geo/` interface + Google adapter + Mapbox clients + unit tests. Wire `service-area.ts`, `/api/service-area`, and the booking action through the interface with `GEO_PROVIDER` defaulting to `google` (no behavior change; full suite proves it).
2. **Schema migration**: additive columns + memo-invalidation-by-provider + persistence/matching updates in `src/lib/booking.ts`.
3. **Client suggestion service**: extract interface, add `@mapbox/search-js-core` implementation, `addressProvider` hidden input + validator changes.
4. **Env/deploy/docs**: `.env.example`, `Dockerfile` ARGs, README env table + ToS notes (constraints 1–2 above), `AGENTS.md` if invariant wording references Google specifically.
5. **End-to-end verification** with `GEO_PROVIDER=mapbox` + `NEXT_PUBLIC_GEO_PROVIDER=mapbox` using the repo `verify` skill: booking flow (suggestion select → advisory check → submit → canonical address persisted with `mapboxId`), post-selection manual edit rejected, admin origin configuration, in-area and out-of-area addresses, provider switch invalidating memos, and Google mode still fully working.

## Open questions / risks

- **Stricter server gate**: the permanent-geocode confidence gate may reject addresses Google's Place Details would have accepted (new construction, unusual units). Monitor `address_not_found` rates after cutover; the `plausible` address-number policy is the main tuning knob.
- **`mapbox_id` stability** across Mapbox data releases is not guaranteed the way Google place IDs are. This design therefore verifies by re-geocode and uses the ID only as a matching hint — do not tighten ID-equality into a hard requirement without evidence.
- **Drive-time parity**: `mapbox/driving` vs. Google Routes durations can diverge on rural routes; spot-check a handful of known-boundary addresses before flipping the default so `maxTravelMinutes` doesn't silently change the effective service area.
- **Pricing** is left to the human before scheduling (session + permanent-geocode + directions volume at current booking rates).
- Japan-only Search API caveats and other non-US considerations are irrelevant (`country=us` throughout).

## Acceptance criteria

- With `GEO_PROVIDER=google` (or unset): zero behavior change; full suite and e2e booking flow pass.
- With `GEO_PROVIDER=mapbox`: booking requires a verified Autofill selection; persisted `CustomerAddress` rows carry Mapbox-canonical `formattedAddress`/lat/lng/`mapboxId` sourced **only** from `permanent=true` geocodes; service-area gate decisions work end-to-end; manual-edit and provider-mismatch submissions are rejected with the existing error codes.
- No Search Box / Autofill `retrieve()` data is persisted anywhere (code-reviewable: the client never sends its retrieve coords into any persistence path — they feed the advisory check only).
- README documents the new env vars and both ToS constraints; `.mcp.json` retains the `mapbox-docs-mcp` entry.
- All new unit tests pass; `service-area.test.ts` unchanged and green.
