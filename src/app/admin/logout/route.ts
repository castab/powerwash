import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "powerwash-admin-session";

export async function GET(request: NextRequest) {
  const redirectTo = request.nextUrl.searchParams.get("redirect") ?? "/admin/login";
  const response = NextResponse.redirect(new URL(redirectTo, request.url));

  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}
