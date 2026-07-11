import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyBookingFormToken } from "@/lib/booking-form-token";
import { getEnv } from "@/lib/env";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/lib/request-ip";
import { checkServiceEligibility } from "@/lib/service-area";

// Reject rendered forms older than this. Generous, since this pre-check can fire
// well into a booking session; the signature already blocks crafted requests.
const FORM_TOKEN_MAX_AGE_MS = 3 * 60 * 60 * 1000;

// Early-feedback pre-check for the booking wizard. Advisory only: the booking
// server action re-runs the authoritative check before any hold or Stripe
// session, so a spoofed response here cannot admit an out-of-area booking.
// Responses carry only the decision status — never raw Google errors.

const requestSchema = z.object({
  formToken: z.string(),
  address: z.string().trim().min(5).max(500),
  placeId: z.string().trim().max(500).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export async function POST(request: NextRequest) {
  const ip = clientIpFromHeaders(request.headers);
  const rate = consumeRateLimit(`service-area:ip:${ip}`, RATE_LIMITS.serviceArea);
  if (!rate.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Require the signed form token so bots can't burn the paid Google Routes
  // budget by hitting this endpoint directly. Signature + expiry only (no min
  // fill time — this fires early and repeatedly during a legitimate session).
  const tokenResult = verifyBookingFormToken(parsed.data.formToken, getEnv().bookingFormSecret, {
    maxAgeMs: FORM_TOKEN_MAX_AGE_MS,
  });
  if (!tokenResult.ok) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 403 });
  }

  const decision = await checkServiceEligibility({
    address: parsed.data.address,
    placeId: parsed.data.placeId,
    lat: parsed.data.lat,
    lng: parsed.data.lng,
  });

  return NextResponse.json(
    {
      status: decision.status,
      travelMinutes:
        "travelDurationSeconds" in decision
          ? Math.round(decision.travelDurationSeconds / 60)
          : undefined,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
