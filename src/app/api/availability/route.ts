import { NextRequest, NextResponse } from "next/server";
import { getAvailableSlots } from "@/lib/booking";
import { RATE_LIMITS, consumeRateLimit } from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/lib/request-ip";

export async function GET(request: NextRequest) {
  const ip = clientIpFromHeaders(request.headers);
  const rate = consumeRateLimit(`availability:ip:${ip}`, RATE_LIMITS.availability);
  if (!rate.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) },
      },
    );
  }

  const serviceId = request.nextUrl.searchParams.get("serviceId");
  const date = request.nextUrl.searchParams.get("date");

  if (!serviceId || !date) {
    return NextResponse.json({ error: "Missing query parameters." }, { status: 400 });
  }

  const slots = await getAvailableSlots(serviceId, date);
  return NextResponse.json(slots);
}
