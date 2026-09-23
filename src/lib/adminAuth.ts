import { jwtVerify, SignJWT } from "jose";

/* Administrative credential engine — fully decoupled from the citizen auth
   stack (src/lib/auth/*). Citizens hold database-backed opaque session tokens
   in `sada_session`; officers hold a self-contained HS256 JWT in
   `sada_admin_token`, scoped to the /admin cookie path so it never travels on
   a citizen route.

   Everything here runs through `jose` (Web Crypto) rather than node:crypto,
   so the same module is safe in the edge proxy and in Node-runtime server
   actions. */

/** Cookie path — the token only rides on admin routes. */
export const ADMIN_COOKIE_PATH = "/admin";

export const ADMIN_COOKIE_NAME = "sada_admin_token";

/** RBAC clearance roster. Anything else — including 'citizen' — is refused at
    the login gate and again inside verifyAdminToken, so a citizen-tier token
    can never be minted or honoured. */
export const ADMIN_ROLES = [
  "superadmin",
  "admin",
  "provincial_lead",
  "district_manager",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

/** Claims carried inside the signed token — verified requests re-surface
    these as x-admin-* headers for downstream Server Components. */
export interface AdminJWTPayload {
  userId: string;
  email: string;
  name: string;
  role: AdminRole;
  department: string;
}

/** Distinguishes tokens minted for this console from any other HS256 JWT on
    the same secret. */
const JWT_ISSUER = "sada-e-awam:admin-console";

/** 12-hour duty shift, or the standard 4-hour window. Mirrors the cookie
    maxAge in actions.ts — keep the two in sync. */
export const ADMIN_SHIFT_MAX_AGE = { shift: 43_200, standard: 14_400 } as const;

/** An ADMIN_JWT_SECRET shorter than this is brute-forceable; production
    refuses to boot on one. Development falls back to a labelled default so
    `next dev` works before the secret is provisioned. */
const DEV_FALLBACK_SECRET =
  "sada-e-awam/admin-console/dev-only-secret-do-not-ship-to-production";

function getSecretKey(): Uint8Array {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (process.env.NODE_ENV === "production") {
    if (!secret || secret.length < 32) {
      throw new Error(
        "ADMIN_JWT_SECRET must be set to at least 32 characters in production.",
      );
    }
  }
  return new TextEncoder().encode(
    secret && secret.length >= 32 ? secret : DEV_FALLBACK_SECRET,
  );
}

/** Mint an officer's session token. `is12HourShift` is the "Maintain active
    session for 12-hour duty shift" checkbox: checked → 12h, else 4h. */
export async function signAdminToken(
  payload: AdminJWTPayload,
  is12HourShift: boolean,
): Promise<string> {
  return new SignJWT({
    email: payload.email,
    name: payload.name,
    role: payload.role,
    department: payload.department,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuer(JWT_ISSUER)
    .setIssuedAt()
    .setExpirationTime(is12HourShift ? "12h" : "4h")
    .sign(getSecretKey());
}

/** Validate signature, issuer, expiry — and the role roster. Returns the
    verified claims, or null for anything tampered, expired, or carrying a
    role that never held console clearance. */
export async function verifyAdminToken(
  token: string,
): Promise<AdminJWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: JWT_ISSUER,
    });
    const role = payload.role;
    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      typeof role !== "string" ||
      !ADMIN_ROLES.includes(role as AdminRole)
    ) {
      return null;
    }
    return {
      userId: payload.sub,
      email: payload.email,
      name: payload.name,
      role: role as AdminRole,
      department:
        typeof payload.department === "string" ? payload.department : "",
    };
  } catch {
    // Expired, malformed, wrong signature/issuer — all resolve to "no session".
    return null;
  }
}
