import { NextResponse } from "next/server";
import {
  clearSessionCookie,
  endCitizenSession,
  verifySession,
} from "@/lib/auth/session";

/* POST /api/auth/signout — deletes the session row and the cookie. Safe to
   call when already signed out: it is a revoke request, and "nothing to revoke"
   is success, not an error. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    if (await verifySession()) await endCitizenSession();
    else {
      // Still clear a cookie whose row is gone or expired, so the browser stops
      // sending dead credentials on every request.
      await clearSessionCookie();
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/auth/signout]", error);
    return NextResponse.json(
      { success: false, error: "Could not sign you out. Try again." },
      { status: 500 },
    );
  }
}
