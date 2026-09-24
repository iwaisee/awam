"use server";

import { redirect } from "next/navigation";
import { compare } from "bcryptjs";
import {
  ADMIN_ROLES,
  endAdminSession,
  startAdminSession,
  type AdminRole,
} from "@/lib/adminAuth";
import { getAdminUserByEmail } from "@/lib/adminUsersDb";

/* The admin console's credential gate — server actions only, no API routes,
   no shared code with the citizen flow. Citizens authenticate by mobile
   number into database-backed session rows (src/lib/auth/*); officers
   authenticate here by official government email + bcrypt password and walk
   out with an opaque session token in the path-scoped sada_admin_session
   cookie, backed by its own `admin_sessions` rows. Data access goes through
   the console's dedicated Neon driver seam (src/lib/adminUsersDb.ts). */

export type AdminLoginState = { error: string } | null;

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

    /* The session row is the clearance record: role and department are read
       back from `users` on every request, never carried in the cookie. */
    await startAdminSession(user);
  } catch (error) {
    console.error("[admin-auth] login failed", error);
    return { error: "Authentication service is temporarily unavailable. Please try again." };
  }

  redirect(redirectTarget);
}

export async function adminLogoutAction(): Promise<void> {
  // Deletes the session row first, so the token is dead server-side even if
  // the browser somehow keeps the cookie.
  await endAdminSession();
  redirect("/admin/login");
}
