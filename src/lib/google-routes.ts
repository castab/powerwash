import { getEnv } from "@/lib/env";

// Thin fetch client for the Google Routes API (computeRoutes). The request
// body/response parsing are exported as pure helpers so the travel-time
// contract is unit-testable without network access.

export type RoutesWaypoint =
  | { placeId: string }
  | { lat: number; lng: number }
  | { address: string };

export type TravelTimeResult =
  | { status: "ok"; durationSeconds: number }
  | { status: "not_found" }
  | { status: "error" };

const ROUTES_ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";
const REQUEST_TIMEOUT_MS = 5_000;

let warnedMissingKey = false;

export function buildRoutesWaypoint(waypoint: RoutesWaypoint) {
  if ("placeId" in waypoint) {
    return { placeId: waypoint.placeId };
  }

  if ("lat" in waypoint) {
    return { location: { latLng: { latitude: waypoint.lat, longitude: waypoint.lng } } };
  }

  return { address: waypoint.address };
}

export function buildComputeRoutesBody(origin: RoutesWaypoint, destination: RoutesWaypoint) {
  return {
    origin: buildRoutesWaypoint(origin),
    destination: buildRoutesWaypoint(destination),
    travelMode: "DRIVE",
  };
}

// Durations come back as seconds strings like "1234s" (or "1234.5s"). An
// empty/absent routes array means Google found no drivable route.
export function parseComputeRoutesResponse(payload: unknown): TravelTimeResult {
  if (typeof payload !== "object" || payload === null) {
    return { status: "error" };
  }

  const routes = (payload as { routes?: unknown }).routes;

  if (!Array.isArray(routes) || routes.length === 0) {
    return { status: "not_found" };
  }

  const duration = (routes[0] as { duration?: unknown }).duration;

  if (typeof duration !== "string" || !/^\d+(\.\d+)?s$/.test(duration)) {
    return { status: "error" };
  }

  return { status: "ok", durationSeconds: Math.round(Number.parseFloat(duration)) };
}

export async function computeTravelTimeSeconds(
  origin: RoutesWaypoint,
  destination: RoutesWaypoint,
): Promise<TravelTimeResult> {
  const apiKey = getEnv().googleMapsServerApiKey;

  if (!apiKey) {
    if (!warnedMissingKey) {
      console.warn(
        "Routes API key missing (GOOGLE_MAPS_SERVER_API_KEY / NEXT_PUBLIC_GOOGLE_MAPS_API_KEY); travel-time checks will fail.",
      );
      warnedMissingKey = true;
    }
    return { status: "error" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(ROUTES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        // Field mask keeps the call in the cheapest (Essentials) billing tier.
        "X-Goog-FieldMask": "routes.duration",
      },
      body: JSON.stringify(buildComputeRoutesBody(origin, destination)),
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

      // Unresolvable waypoints surface as 400s (NOT_FOUND / geocoding failures)
      // rather than empty route lists — treat them as an address problem the
      // customer can fix, not an outage.
      if (response.status === 400 && /NOT_FOUND|geocoded|INVALID_ARGUMENT/i.test(message)) {
        return { status: "not_found" };
      }

      console.error(`Routes API request failed (${response.status}): ${message.trim()}`);
      return { status: "error" };
    }

    return parseComputeRoutesResponse(await response.json());
  } catch (error) {
    console.error("Routes API request failed:", error instanceof Error ? error.message : error);
    return { status: "error" };
  } finally {
    clearTimeout(timeout);
  }
}
