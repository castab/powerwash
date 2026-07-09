import { headers } from "next/headers";

/**
 * Best-effort client IP for rate limiting. Behind the Railway/Vercel proxy the
 * real client address is the first entry of `x-forwarded-for`. Falls back to
 * `x-real-ip`, then a shared `"unknown"` bucket so requests without a resolvable
 * IP are still throttled together rather than escaping the limiter entirely.
 */
export function clientIpFromHeaders(headerList: Headers): string {
  const forwardedFor = headerList.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = headerList.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

export async function getClientIp(): Promise<string> {
  const headerList = await headers();
  return clientIpFromHeaders(headerList);
}
