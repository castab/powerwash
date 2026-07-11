import { createHmac, timingSafeEqual } from "node:crypto";

// Pure sign/verify for customer manage-link tokens. Kept free of DB, email, and
// env dependencies so the token invariants (tamper rejection, version/rotation
// binding) can be exercised directly in unit tests. `booking-management.ts`
// wraps these with the customer row and `getEnv().manageLinkSecret`.
// The token is customer-scoped: one link opens every non-archived booking the
// customer has, and rotating the customer's version invalidates all prior links.
export type ManageTokenPayload = {
  customerId: string;
  version: number;
  rotatedAt: number;
};

function signPayload(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function encodePayload(payload: ManageTokenPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(encodedPayload: string): ManageTokenPayload | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<ManageTokenPayload> | null;

    // Shape guard: legacy booking-scoped tokens (and any other well-signed but
    // differently-shaped payload) must fail decode rather than reach the DB.
    if (
      !parsed ||
      typeof parsed.customerId !== "string" ||
      typeof parsed.version !== "number" ||
      typeof parsed.rotatedAt !== "number"
    ) {
      return null;
    }

    return { customerId: parsed.customerId, version: parsed.version, rotatedAt: parsed.rotatedAt };
  } catch {
    return null;
  }
}

export function createManageToken(payload: ManageTokenPayload, secret: string) {
  const encodedPayload = encodePayload(payload);
  const signature = signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyManageToken(token: string, secret: string): ManageTokenPayload | null {
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload, secret);
  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  return decodePayload(encodedPayload);
}
