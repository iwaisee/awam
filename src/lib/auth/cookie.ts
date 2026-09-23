/* The session cookie's identity, in a module with no other dependencies —
   `proxy.ts`, the session store and the browser-side docs all need the name,
   and none of them should have to pull in the database layer to say it. */

export const SESSION_COOKIE_NAME = "sada_session";

/** Presence only — a cookie can be forged, so this never stands in for the
   database check in src/lib/auth/session.ts. */
export function hasSessionCookie(rawCookieHeader: string | null): boolean {
  if (!rawCookieHeader) return false;
  return rawCookieHeader.split(";").some((pair) => {
    const [name, ...rest] = pair.trim().split("=");
    return name === SESSION_COOKIE_NAME && rest.join("=").length > 0;
  });
}
