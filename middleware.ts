import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Edge middleware cannot reach the database, so this only checks that a session
// cookie is *present* — it is a cheap gate, NOT authentication. Real verification
// (signature + admin lookup) happens in `requireAdmin()`, which every admin page
// enters via `AdminShell`. Any admin route handler that does more than clear
// cookies (unlike `/admin/logout/route.ts`) is NOT covered by AdminShell and must
// call `requireAdmin()` itself.
export function middleware(request: NextRequest) {
  const isAdminPath = request.nextUrl.pathname.startsWith("/admin");
  const isLoginPath = request.nextUrl.pathname === "/admin/login";
  const sessionCookie = request.cookies.get("powerwash-admin-session");

  if (isAdminPath && !isLoginPath && !sessionCookie) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
