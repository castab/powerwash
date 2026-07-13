import { getEnv } from "@/lib/env";

// Thin fetch client for the Places API (New) Place Details endpoint. The
// response parsing is exported as a pure helper so the canonical-address
// contract is unit-testable without network access.
//
// The booking action resolves the customer-submitted placeId through this
// client and persists Google's canonical formatted address, so a spoofed
// client cannot pair a valid placeId with arbitrary address text.

export type PlaceDetailsResult =
  | {
      status: "ok";
      formattedAddress: string;
      lat: number;
      lng: number;
      components?: unknown[];
    }
  | { status: "not_found" }
  | { status: "error" };

const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places";
const REQUEST_TIMEOUT_MS = 5_000;

let warnedMissingKey = false;

// Location and formattedAddress must both be present for a usable canonical
// address; a place lacking either is treated as unresolvable, matching the
// client-side rule in AddressAutocompleteInput.
export function parsePlaceDetailsResponse(payload: unknown): PlaceDetailsResult {
  if (typeof payload !== "object" || payload === null) {
    return { status: "error" };
  }

  const place = payload as {
    formattedAddress?: unknown;
    location?: { latitude?: unknown; longitude?: unknown };
    addressComponents?: unknown;
  };

  if (typeof place.formattedAddress !== "string" || place.formattedAddress.trim().length === 0) {
    return { status: "not_found" };
  }

  const latitude = place.location?.latitude;
  const longitude = place.location?.longitude;

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return { status: "not_found" };
  }

  return {
    status: "ok",
    formattedAddress: place.formattedAddress,
    lat: latitude,
    lng: longitude,
    components: Array.isArray(place.addressComponents) ? place.addressComponents : undefined,
  };
}

// Per-instance cache bounding Places API spend on repeat submits of the same
// place (retries, double-clicks, returning customers on one instance).
// Transient failures are never cached.
const PLACE_DETAILS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PLACE_DETAILS_CACHE_MAX_ENTRIES = 500;

type PlaceDetailsCacheEntry = { result: PlaceDetailsResult; expiresAt: number };

const placeDetailsCache = new Map<string, PlaceDetailsCacheEntry>();

function prunePlaceDetailsCache(now: number) {
  for (const [key, entry] of placeDetailsCache) {
    if (entry.expiresAt <= now) {
      placeDetailsCache.delete(key);
    }
  }

  // Still over the cap after dropping expired entries: evict oldest-inserted.
  while (placeDetailsCache.size >= PLACE_DETAILS_CACHE_MAX_ENTRIES) {
    const oldestKey = placeDetailsCache.keys().next().value;
    if (oldestKey === undefined) break;
    placeDetailsCache.delete(oldestKey);
  }
}

export async function fetchPlaceDetails(placeId: string): Promise<PlaceDetailsResult> {
  const apiKey = getEnv().googleMapsServerApiKey;

  if (!apiKey) {
    if (!warnedMissingKey) {
      console.warn(
        "Places API key missing (GOOGLE_MAPS_SERVER_API_KEY / NEXT_PUBLIC_GOOGLE_MAPS_API_KEY); canonical address resolution will fail.",
      );
      warnedMissingKey = true;
    }
    return { status: "error" };
  }

  const now = Date.now();
  const cached = placeDetailsCache.get(placeId);

  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${PLACES_ENDPOINT}/${encodeURIComponent(placeId)}`, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey,
        // Field mask keeps the call in the cheapest applicable billing tier.
        "X-Goog-FieldMask": "id,formattedAddress,location,addressComponents",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      let message = "";
      try {
        const body = (await response.json()) as { error?: { message?: string; status?: string } };
        message = `${body.error?.status ?? ""} ${body.error?.message ?? ""}`;
      } catch {
        // Non-JSON error body; fall through with an empty message.
      }

      // Unknown or malformed place ids surface as 404s / INVALID_ARGUMENT 400s —
      // an address problem the customer can fix, not an outage.
      if (response.status === 404 || (response.status === 400 && /NOT_FOUND|INVALID_ARGUMENT/i.test(message))) {
        const result: PlaceDetailsResult = { status: "not_found" };
        prunePlaceDetailsCache(now);
        placeDetailsCache.set(placeId, { result, expiresAt: now + PLACE_DETAILS_CACHE_TTL_MS });
        return result;
      }

      console.error(`Place Details request failed (${response.status}): ${message.trim()}`);
      return { status: "error" };
    }

    const result = parsePlaceDetailsResponse(await response.json());

    if (result.status !== "error") {
      prunePlaceDetailsCache(now);
      placeDetailsCache.set(placeId, { result, expiresAt: now + PLACE_DETAILS_CACHE_TTL_MS });
    }

    return result;
  } catch (error) {
    console.error("Place Details request failed:", error instanceof Error ? error.message : error);
    return { status: "error" };
  } finally {
    clearTimeout(timeout);
  }
}
