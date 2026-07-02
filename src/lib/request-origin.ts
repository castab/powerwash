import { headers } from "next/headers";

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function normalizeOrigin(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function getProtocol(host: string, forwardedProto: string | null) {
  const proto = forwardedProto?.replace(":", "").toLowerCase();
  if (proto === "http" || proto === "https") {
    return proto;
  }

  return host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
}

export async function getRequestOrigin(fallbackOrigin: string) {
  const headerList = await headers();
  const forwardedHost = firstHeaderValue(headerList.get("x-forwarded-host"));
  const host = forwardedHost ?? firstHeaderValue(headerList.get("host"));

  if (host) {
    const proto = getProtocol(host, firstHeaderValue(headerList.get("x-forwarded-proto")));
    const origin = normalizeOrigin(`${proto}://${host}`);

    if (origin) {
      return origin;
    }
  }

  return normalizeOrigin(headerList.get("origin")) ?? fallbackOrigin;
}
