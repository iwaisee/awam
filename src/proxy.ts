import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE_NAME } from "@/lib/adminCookie";
import { SESSION_COOKIE_NAME } from "@/lib/auth/cookie";
import { signInHref, withQuery } from "@/lib/auth/returnPath";

/* Two independent, decoupled gates in one proxy file, both presence-only.

   ADMIN GATE (/admin/*): the sada_admin_session cookie is an opaque random
   token whose SHA-256 lives in the `admin_sessions` table, so nothing here can
   judge it — the proxy only routes. The database verdict is rendered once per
   request in the console layout (src/app/(console)/layout.tsx), which is what
   makes a logout, a demotion or a deleted account take effect immediately.

   CITIZEN GATE (/report, /settings): presence-only, as before — cookies can be
   forged, so those surfaces still re-verify against the database in
   src/lib/auth/session.ts. */

const GATED_PATHS = ["/report", "/settings"];

const ADMIN_LOGIN_PATH = "/admin/login";

function isGated(pathname: string): boolean {
  return GATED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function handleAdmin(
  request: NextRequest,
  pathname: string,
): NextResponse {
  // The sign-in surface stays reachable while a cookie is present: this layer
  // cannot tell a live session from a dead one, and bouncing on presence alone
  // would loop an officer whose row has just expired. The login page checks the
  // database and redirects a genuine session onward itself.
  if (pathname === ADMIN_LOGIN_PATH || pathname.startsWith(`${ADMIN_LOGIN_PATH}/`)) {
    return NextResponse.next();
  }

  // No cookie at all → straight to sign-in, carrying the deep link. With one
  // present the real gate is src/app/(console)/layout.tsx.
  if (!request.cookies.get(ADMIN_COOKIE_NAME)?.value) {
    return NextResponse.redirect(
      new URL(
        `/admin/login?redirect=${encodeURIComponent(pathname)}`,
        request.url,
      ),
    );
  }

  return NextResponse.next();
}

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (isAdminPath(pathname)) return handleAdmin(request, pathname);

  if (!isGated(pathname)) return NextResponse.next();
  if (request.cookies.get(SESSION_COOKIE_NAME)?.value) return NextResponse.next();

  // Carry the deep link through sign-in: /report?city=sialkot and
  // /settings?tab=privacy must land where the citizen was headed, not on a
  // blank wizard or the default tab.
  const returnPath = withQuery(
    pathname,
    Object.fromEntries(searchParams.entries()),
  );
  return NextResponse.redirect(new URL(signInHref(returnPath), request.url));
}

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/report",
    "/report/:path*",
    "/settings",
    "/settings/:path*",
  ],
};
