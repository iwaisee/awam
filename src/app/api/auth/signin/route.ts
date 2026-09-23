import { NextResponse } from "next/server";
import { authenticateCitizenUser } from "@/lib/auth/usersDb";
import { startCitizenSession } from "@/lib/auth/session";
import { buildSessionPayload } from "@/lib/auth/payload";
import {
  clearFailedAttempts,
  lockoutRemainingMs,
  registerFailedAttempt,
} from "@/lib/auth/lockout";
import { fieldErrorsFrom, signinSchema } from "@/lib/auth/schemas";

/* POST /api/auth/signin — verifies the password against the stored scrypt hash
   and mints a database-backed session.

   Both a wrong password and an unknown identifier produce the same 401 text,
   and the unknown-identifier path still spends a scrypt round, so neither the
   response body nor its timing tells an attacker whether an account exists. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = signinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Check the highlighted fields and try again.",
        field_errors: fieldErrorsFrom(parsed.error),
      },
      { status: 422 },
    );
  }

  const { identifier, password, remember } = parsed.data;
  // One bucket per credential, so locking a guessed-at address cannot lock the
  // citizen who knows their password out of an unrelated one.
  const lockoutKey = identifier.toLowerCase();
  const lockedFor = lockoutRemainingMs(lockoutKey);
  if (lockedFor > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Too many failed attempts — try again in ${Math.ceil(lockedFor / 1000)}s.`,
        retry_after_seconds: Math.ceil(lockedFor / 1000),
      },
      { status: 429 },
    );
  }

  try {
    const user = await authenticateCitizenUser(identifier, password);
    if (!user) {
      const wait = registerFailedAttempt(lockoutKey);
      return NextResponse.json(
        {
          success: false,
          error:
            wait > 0
              ? `Too many failed attempts — wait ${Math.ceil(wait / 1000)}s before trying again.`
              : "We couldn't match those details with a citizen account.",
          ...(wait > 0 ? { retry_after_seconds: Math.ceil(wait / 1000) } : {}),
        },
        { status: 401 },
      );
    }

    clearFailedAttempts(lockoutKey);
    await startCitizenSession(user, remember);
    return NextResponse.json({ success: true, ...(await buildSessionPayload(user)) });
  } catch (error) {
    console.error("[api/auth/signin]", error);
    return NextResponse.json(
      { success: false, error: "Could not sign you in. Try again." },
      { status: 500 },
    );
  }
}
