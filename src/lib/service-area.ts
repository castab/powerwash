import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

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
