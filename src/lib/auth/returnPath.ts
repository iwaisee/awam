/* Where a signed-in citizen is sent back to. Shared by the page gate (server)
   and the auth card (client), so the two can never disagree on what counts as
   a safe target: ?redirect= is attacker-controllable, and only a same-origin
   app path may be followed. */

/** Fallback when the parameter is missing or unusable. */
export const DEFAULT_RETURN_PATH = "/report";

export function isSafeReturnPath(raw: string): boolean {
  // A leading "//" or "/\" is a scheme-relative URL — browsers follow those
  // to another host, which is exactly the open redirect this guards.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\"))
    return false;
  let parsed: URL;
  try {
    parsed = new URL(raw, "http://sada.test");
  } catch {
    return false;
  }
  // Same-origin after parsing means no foreign host slipped through.
  if (parsed.origin !== "http://sada.test") return false;
  // /auth must never be a target: it would loop a signed-out citizen back to
  // the gate they just came from.
  return parsed.pathname !== "/auth";
}

export function safeReturnPath(raw: string | null | undefined): string {
  return raw && isSafeReturnPath(raw) ? raw : DEFAULT_RETURN_PATH;
}

/** Rebuild a gated page's own deep link (e.g. `/report?city=sialkot`) so the
    sign-in round-trip returns the citizen to the exact view they were sent
    from — a landing-page "report this category" link must not degrade into a
    blank wizard. Empty and absent params are dropped. */
export function withQuery(
  path: string,
  params: Record<string, string | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

/** Build the sign-in URL for a citizen who was stopped at a gate. */
export function signInHref(returnPath: string): string {
  const target = safeReturnPath(returnPath);
  return `/auth?redirect=${encodeURIComponent(target)}`;
}
