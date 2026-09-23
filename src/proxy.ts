import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_COOKIE_PATH,
  verifyAdminToken,
} from "@/lib/adminAuth";
import { SESSION_COOKIE_NAME } from "@/lib/auth/cookie";
import { signInHref, withQuery } from "@/lib/auth/returnPath";

/* Two independent, decoupled gates in one proxy file.

   ADMIN GATE (/admin/*): the sada_admin_token cookie carries a signed JWT, so
   unlike the citizen gate the check here is cryptographic — signature, issuer
   and expiry are verified via `jose` (edge-safe Web Crypto, no node:crypto).
   Valid claims ride downstream as x-admin-* request headers for Server
   Components; a present-but-invalid token is deleted so it cannot shadow a
   future session. Login POSTs are Server Functions on the page route, so the
   /admin matcher also covers them — the login page is the explicit exception.

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

async function handleAdmin(
  request: NextRequest,
  pathname: string,
): Promise<NextResponse> {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;

  // The sign-in surface itself: an already-cleared officer never sees the
  // form again; everyone else gets it.
  if (pathname === ADMIN_LOGIN_PATH || pathname.startsWith(`${ADMIN_LOGIN_PATH}/`)) {
    if (token && (await verifyAdminToken(token))) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  // No token at all → straight to sign-in, carrying the deep link.
  if (!token) {
    return NextResponse.redirect(
      new URL(
        `/admin/login?redirect=${encodeURIComponent(pathname)}`,
        request.url,
      ),
    );
  }

  const claims = await verifyAdminToken(token);
  if (!claims) {
    // Expired or tampered: strip the cookie (its path scope must match) and
    // land on a clean sign-in.
    const response = NextResponse.redirect(
      new URL(ADMIN_LOGIN_PATH, request.url),
    );
    response.cookies.delete({ name: ADMIN_COOKIE_NAME, path: ADMIN_COOKIE_PATH });
    return response;
  }

  // Verified officer — hand the claims to downstream Server Components
  // without ever exposing the token itself.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-admin-id", claims.userId);
  requestHeaders.set("x-admin-role", claims.role);
  requestHeaders.set("x-admin-dept", claims.department);
  return NextResponse.next({ request: { headers: requestHeaders } });
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
