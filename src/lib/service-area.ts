import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  computeTravelTimeSeconds,
  type RoutesWaypoint,
  type TravelTimeResult,
} from "@/lib/google-routes";
import { findMatchingAddress, normalizeCustomerEmail } from "@/lib/booking";

export type BusinessSettingsRecord = Prisma.BusinessSettingsGetPayload<Record<string, never>>;

// The singleton row is created by migration 0006 and the seed; the upsert
// fallback covers databases bootstrapped before either ran.
export async function getBusinessSettings(): Promise<BusinessSettingsRecord> {
  const existing = await prisma.businessSettings.findUnique({ where: { id: 1 } });

  if (existing) {
    return existing;
  }

  return prisma.businessSettings.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
}

// The service-area gate only runs once both an origin (place id, coordinates,
// or at least a routable address string) and a max travel time are configured.
export function isServiceAreaConfigured(settings: {
  originFormattedAddress: string | null;
  originPlaceId: string | null;
  originLat: unknown | null;
  originLng: unknown | null;
  maxTravelMinutes: number | null;
}) {
  const hasOrigin = Boolean(
    settings.originPlaceId ||
      (settings.originLat !== null && settings.originLng !== null) ||
      (settings.originFormattedAddress && settings.originFormattedAddress.trim().length > 0),
  );

  return hasOrigin && settings.maxTravelMinutes !== null && settings.maxTravelMinutes > 0;
}

export type EligibilityDecision =
  | { status: "eligible"; travelDurationSeconds: number }
  | { status: "ineligible"; travelDurationSeconds: number }
  | { status: "unconfigured" }
  | { status: "address_not_found" }
  | { status: "unavailable" };

export type ServiceAreaDestination = {
  address: string;
  placeId?: string;
  lat?: number;
  lng?: number;
};

// Pure decision rule: a drive exactly at the max is still eligible.
export function decideEligibility(
  maxTravelMinutes: number,
  result: TravelTimeResult,
): EligibilityDecision {
  if (result.status === "not_found") {
    return { status: "address_not_found" };
  }

  if (result.status === "error") {
    return { status: "unavailable" };
  }

  return {
    status: result.durationSeconds <= maxTravelMinutes * 60 ? "eligible" : "ineligible",
    travelDurationSeconds: result.durationSeconds,
  };
}

// A stored per-address memo is fresh only if it was checked after the service
// area was last saved — saving settings implicitly invalidates every memo.
export function isEligibilityMemoFresh(
  address: { serviceEligible: boolean | null; eligibilityCheckedAt: Date | null },
  settings: { updatedAt: Date },
) {
  return (
    address.serviceEligible !== null &&
    address.eligibilityCheckedAt !== null &&
    address.eligibilityCheckedAt.getTime() >= settings.updatedAt.getTime()
  );
}

function toDestinationWaypoint(destination: ServiceAreaDestination): RoutesWaypoint {
  if (destination.placeId) {
    return { placeId: destination.placeId };
  }

  if (destination.lat !== undefined && destination.lng !== undefined) {
    return { lat: destination.lat, lng: destination.lng };
  }

  return { address: destination.address };
}

function toOriginWaypoint(settings: BusinessSettingsRecord): RoutesWaypoint | null {
  if (settings.originPlaceId) {
    return { placeId: settings.originPlaceId };
  }

  if (settings.originLat !== null && settings.originLng !== null) {
    return { lat: Number(settings.originLat), lng: Number(settings.originLng) };
  }

  if (settings.originFormattedAddress) {
    return { address: settings.originFormattedAddress };
  }

  return null;
}

// Per-instance cache bounding Routes API spend from the pre-check endpoint.
// Keyed on the settings' updatedAt so saving new settings invalidates entries
// naturally. Transient failures are never cached.
const ELIGIBILITY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ELIGIBILITY_CACHE_MAX_ENTRIES = 500;

type EligibilityCacheEntry = { decision: EligibilityDecision; expiresAt: number };

const eligibilityCache = new Map<string, EligibilityCacheEntry>();

function eligibilityCacheKey(settingsUpdatedAt: Date, destination: ServiceAreaDestination) {
  const destinationKey =
    destination.placeId ?? destination.address.trim().toLowerCase().replace(/\s+/g, " ");
  return `${settingsUpdatedAt.getTime()}|${destinationKey}`;
}

function pruneEligibilityCache(now: number) {
  for (const [key, entry] of eligibilityCache) {
    if (entry.expiresAt <= now) {
      eligibilityCache.delete(key);
    }
  }

  // Still over the cap after dropping expired entries: evict oldest-inserted.
  while (eligibilityCache.size >= ELIGIBILITY_CACHE_MAX_ENTRIES) {
    const oldestKey = eligibilityCache.keys().next().value;
    if (oldestKey === undefined) break;
    eligibilityCache.delete(oldestKey);
  }
}

export async function checkServiceEligibility(
  destination: ServiceAreaDestination,
): Promise<EligibilityDecision> {
  const settings = await getBusinessSettings();

  if (!isServiceAreaConfigured(settings)) {
    return { status: "unconfigured" };
  }

  const now = Date.now();
  const key = eligibilityCacheKey(settings.updatedAt, destination);
  const cached = eligibilityCache.get(key);

  if (cached && cached.expiresAt > now) {
    return cached.decision;
  }

  const origin = toOriginWaypoint(settings);

  if (!origin) {
    return { status: "unconfigured" };
  }

  const result = await computeTravelTimeSeconds(origin, toDestinationWaypoint(destination));
  const decision = decideEligibility(settings.maxTravelMinutes ?? 0, result);

  if (decision.status !== "unavailable") {
    pruneEligibilityCache(now);
    eligibilityCache.set(key, { decision, expiresAt: now + ELIGIBILITY_CACHE_TTL_MS });
  }

  return decision;
}

// Re-booking fast path: a returning customer whose known address carries a
// fresh eligible memo skips the Routes API call entirely. Only eligible memos
// are ever persisted (out-of-area attempts never create bookings or rows).
export async function findFreshEligibleAddressMemo(input: {
  email: string;
  address: string;
  placeId?: string;
}) {
  const settings = await getBusinessSettings();

  if (!isServiceAreaConfigured(settings)) {
    return null;
  }

  const customer = await prisma.customer.findUnique({
    where: { email: normalizeCustomerEmail(input.email) },
    include: { addresses: true },
  });

  if (!customer) {
    return null;
  }

  const match = findMatchingAddress(customer.addresses, {
    placeId: input.placeId,
    formattedAddress: input.address,
  });

  if (!match || !isEligibilityMemoFresh(match, settings) || !match.serviceEligible) {
    return null;
  }

  return match;
}
