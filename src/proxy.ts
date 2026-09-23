import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/cookie";
import { signInHref, withQuery } from "@/lib/auth/returnPath";

/* Optimistic citizen gate for the account-only surfaces.

   This only checks that a session cookie EXISTS — it cannot verify one, because
   verifying means a database read and Proxy is not the place for that. Every
   page below still calls `verifySession` (src/lib/auth/session.ts) and every
   route handler re-checks, so a stale or forged cookie gets a 401 or a
   server-side redirect rather than access. What this buys is the cheap win:
   the wizard's chrome never renders for a signed-out visitor, so there is no
   flash of a form they cannot submit. */

const GATED_PATHS = ["/report", "/settings"];

function isGated(pathname: string): boolean {
  return GATED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
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
  matcher: ["/report", "/report/:path*", "/settings", "/settings/:path*"],
};
