import { cache } from "react";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/auth/cookie";
import {
  createCitizenSession,
  getCitizenSessionUser,
  revokeCitizenSession,
} from "@/lib/auth/sessionsDb";
import type { CitizenUser } from "@/lib/auth/usersDb";

/* The citizen session cookie — the seam every protected surface reads through.

   Reading goes through `verifySession`, which React memoises per request: a
   page, its layout, and a Server Component below it therefore share one
   database roundtrip instead of one each. */

/** Vercel serves the pilot over HTTPS, so the cookie is `Secure` there; local
    dev runs on http://localhost, where that flag would drop every request. */
const IS_SECURE_CONTEXT = process.env.NODE_ENV === "production";

export async function startCitizenSession(
  user: CitizenUser,
  remember: boolean,
): Promise<void> {
  const session = await createCitizenSession(user.id, remember);
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: session.token,
    httpOnly: true,
    sameSite: "lax",
    secure: IS_SECURE_CONTEXT,
    path: "/",
    // Unticked "remember" stays a browser-session cookie: no expiry attribute,
    // so it is gone when the window closes (the row still expires server-side).
    ...(session.remember ? { expires: session.expiresAt } : {}),
  });
}

/** Drop the cookie without touching the database — for a token whose session
    row is already gone (revoked, expired, or the account deleted). */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function endCitizenSession(): Promise<void> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (raw) await revokeCitizenSession(raw);
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/** The signed-in citizen, or null. A tampered, expired, or logged-out cookie
    all resolve to null — callers answer 401 or redirect, never 500. */
export const verifySession = cache(async (): Promise<CitizenUser | null> => {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    return await getCitizenSessionUser(raw);
  } catch (error) {
    console.error("[auth] session lookup failed", error);
    return null;
  }
});
