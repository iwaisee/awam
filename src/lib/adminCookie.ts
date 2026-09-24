/* The officer session cookie's identity, in a module with no other
   dependencies — `proxy.ts` runs on the edge runtime and must be able to name
   the cookie without pulling the database layer and node:crypto into its
   bundle. Same reasoning as src/lib/auth/cookie.ts. */

/** Cookie path — the session token only rides on admin routes, so it never
    travels on a citizen request and vice versa. */
export const ADMIN_COOKIE_PATH = "/admin";

export const ADMIN_COOKIE_NAME = "sada_admin_session";
