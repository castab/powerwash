import { NextRequest, NextResponse } from "next/server";
import { getAvailableSlots } from "@/lib/booking";

export async function GET(request: NextRequest) {
  const serviceId = request.nextUrl.searchParams.get("serviceId");
  const date = request.nextUrl.searchParams.get("date");

  if (!serviceId || !date) {
    return NextResponse.json({ error: "Missing query parameters." }, { status: 400 });
  }

  const slots = await getAvailableSlots(serviceId, date);
  return NextResponse.json(slots);
}
