"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { compare } from "bcryptjs";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_COOKIE_PATH,
  ADMIN_ROLES,
  signAdminToken,
  type AdminRole,
} from "@/lib/adminAuth";
import { getAdminUserByEmail } from "@/lib/adminUsersDb";

/* The admin console's credential gate — server actions only, no API routes,
   no shared code with the citizen flow. Citizens authenticate by mobile
   number into database-backed session rows (src/lib/auth/*); officers
   authenticate here by official government email + bcrypt password and walk
   out with a signed JWT in the path-scoped sada_admin_token cookie.
   Data access goes through the console's dedicated Neon driver seam
   (src/lib/adminUsersDb.ts). */

export type AdminLoginState = { error: string } | null;

/** `secure` in production (Vercel serves HTTPS); plain http locally, where
    the flag would make the browser drop every cookie. */
const IS_SECURE_CONTEXT = process.env.NODE_ENV === "production";

/** Only same-origin /admin app paths may follow a ?redirect= — anything else
    (scheme-relative "//host", "/admin/login" loops, foreign paths) falls back
    to the console root. */
function safeAdminRedirect(raw: string): string {
  const isAdminPath =
    raw === "/admin" || (raw.startsWith("/admin/") && !raw.startsWith("/admin/login"));
  return raw.startsWith("/") &&
    !raw.startsWith("//") &&
    !raw.startsWith("/\\") &&
    isAdminPath
    ? raw
    : "/admin";
}

export async function adminLoginAction(
  _prevState: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTarget = safeAdminRedirect(String(formData.get("redirect") ?? ""));

  if (!email || !password) {
    return { error: "Enter both the official government email and the administrative password." };
  }

  let token: string;
  try {
    const user = await getAdminUserByEmail(email);

    if (!user) {
      return { error: "Account not found in departmental directory." };
    }

    /* RBAC gate. The roster check doubles as the citizen rejection: a
       citizen-tier account is refused here regardless of password, so a
       citizen account can never mint an admin token. */
    const role = (user.role ?? "citizen").toLowerCase();
    if (role === "citizen") {
      return {
        error:
          "Access Denied: Citizen accounts do not hold municipal clearance. Please sign in via the citizen portal.",
      };
    }
    if (!ADMIN_ROLES.includes(role as AdminRole)) {
      return {
        error:
          "Access Denied: This account does not hold administrative clearance for the console.",
      };
    }

    if (!user.password_hash) {
      return { error: "No credential is on file for this account. Contact the provincial secretariat." };
    }

    const passwordMatches = await compare(password, user.password_hash);
    if (!passwordMatches) {
      return { error: "Authentication failed: the password does not match departmental records." };
    }

    /* The department claim comes solely from the clearance row on file —
       the login form carries no department field. Sessions default to the
       full 12-hour duty shift (what the removed checkbox did when ticked). */
    token = await signAdminToken(
      {
        userId: user.id,
        email: user.email,
        name: user.full_name,
        role: role as AdminRole,
        department: user.department ?? "",
      },
      true,
    );
  } catch (error) {
    console.error("[admin-auth] login failed", error);
    return { error: "Authentication service is temporarily unavailable. Please try again." };
  }

  // Path-scoped to /admin: the token never travels on citizen routes, and
  // citizen cookies (sada_session) never travel here.
  const cookieStore = await cookies();
  cookieStore.set({
    name: ADMIN_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: IS_SECURE_CONTEXT,
    sameSite: "lax",
    path: ADMIN_COOKIE_PATH,
    maxAge: 43_200,
  });

  redirect(redirectTarget);
}

export async function adminLogoutAction(): Promise<void> {
  // Overwrite with an immediate-expiry cookie on the same path — a bare
  // delete() would target path "/" and leave the /admin-scoped cookie alive.
  const cookieStore = await cookies();
  cookieStore.set({
    name: ADMIN_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: IS_SECURE_CONTEXT,
    sameSite: "lax",
    path: ADMIN_COOKIE_PATH,
    maxAge: 0,
  });
  redirect("/admin/login");
}
