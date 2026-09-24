import { cache } from "react";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, ADMIN_COOKIE_PATH } from "@/lib/adminCookie";
import {
  createAdminSession,
  getAdminSessionUser,
  revokeAdminSession,
} from "@/lib/adminSessionsDb";
import type { AdminUserRow } from "@/lib/adminUsersDb";

/* The officer session cookie — the seam every protected admin surface reads
   through. Same design as the citizen flow (src/lib/auth/session.ts): an
   opaque random token in the browser, its SHA-256 in `admin_sessions`, and the
   database as the single source of truth. Nothing is signed, so there is no
   signing key to provision, and deleting a row ends a session immediately.

   Still fully decoupled from the citizen stack: different cookie, different
   table, different Neon seam (src/lib/adminUsersDb.ts). */

/** 12-hour duty shift. Mirrors SESSION_HOURS in src/lib/adminSessionsDb.ts —
    keep the two in sync. */
export const ADMIN_COOKIE_MAX_AGE = 43_200;

/** RBAC clearance roster. Anything else — including 'citizen' — is refused at
    the login gate and again in verifyAdminSession, so a citizen-tier account
    can never hold a console session, and a demotion takes effect on the next
    request rather than at token expiry. */
export const ADMIN_ROLES = [
  "superadmin",
  "admin",
  "provincial_lead",
  "district_manager",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

/** Vercel serves the pilot over HTTPS, so the cookie is `Secure` there; local
    dev runs on http://localhost, where that flag would drop every request. */
const IS_SECURE_CONTEXT = process.env.NODE_ENV === "production";

/** Mint the session row and hand the browser its token. */
export async function startAdminSession(user: AdminUserRow): Promise<void> {
  const session = await createAdminSession(user.id);
  const cookieStore = await cookies();
  cookieStore.set({
    name: ADMIN_COOKIE_NAME,
    value: session.token,
    httpOnly: true,
    secure: IS_SECURE_CONTEXT,
    sameSite: "lax",
    path: ADMIN_COOKIE_PATH,
    maxAge: ADMIN_COOKIE_MAX_AGE,
  });
}

/** Delete the row, then the cookie. Revocation happens on the server, so a
    stolen cookie stops working even if it survives in the browser. */
export async function endAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (raw) await revokeAdminSession(raw);
  // Overwrite with an immediate expiry on the same path — `delete(name)`
  // targets path "/", which would leave this /admin-scoped cookie alive.
  cookieStore.set({
    name: ADMIN_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: IS_SECURE_CONTEXT,
    sameSite: "lax",
    path: ADMIN_COOKIE_PATH,
    maxAge: 0,
  });
}

/** The signed-in officer, or null. A tampered, expired, demoted, or
    logged-out cookie all resolve to null — callers redirect, never 500.

    Memoised per request so the console layout and anything below it share one
    database roundtrip. */
export const verifyAdminSession = cache(async (): Promise<AdminUserRow | null> => {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    const user = await getAdminSessionUser(raw);
    if (!user) return null;
    const role = (user.role ?? "citizen").toLowerCase();
    return ADMIN_ROLES.includes(role as AdminRole) ? user : null;
  } catch (error) {
    console.error("[admin-auth] session lookup failed", error);
    return null;
  }
});
