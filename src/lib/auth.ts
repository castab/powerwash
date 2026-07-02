import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";

const COOKIE_NAME = "powerwash-admin-session";
const encoder = new TextEncoder();

type SessionPayload = {
  adminId: string;
  email: string;
  name: string;
};

async function getSecret() {
  const env = getEnv();
  return encoder.encode(env.adminSessionSecret);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function createAdminSession(payload: SessionPayload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(await getSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getAdminSession() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, await getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const admin = await prisma.adminUser.findUnique({
    where: { id: session.adminId },
  });

  if (!admin || !admin.isActive) {
    redirect("/admin/logout?redirect=/admin/login");
  }

  return admin;
}
