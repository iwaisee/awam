import { NextResponse } from "next/server";
import {
  DuplicateContactError,
  createCitizenUser,
} from "@/lib/auth/usersDb";
import { startCitizenSession } from "@/lib/auth/session";
import { buildSessionPayload } from "@/lib/auth/payload";
import { fieldErrorsFrom, signupSchema } from "@/lib/auth/schemas";

/* POST /api/auth/signup — creates the account and signs the citizen straight
   in. The email/phone uniqueness rules are enforced by the database's partial
   unique indexes, not by a check-then-insert, so two simultaneous signups for
   the same contact cannot both win.

   The response never says *which* identifier was already taken; that answer is
   an account-existence oracle for anyone probing the endpoint. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
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

  try {
    const { name, email, phone, district, password } = parsed.data;
    const user = await createCitizenUser({
      name,
      email,
      phone,
      district,
      password,
    });
    await startCitizenSession(user, true);
    return NextResponse.json(
      { success: true, ...(await buildSessionPayload(user)) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof DuplicateContactError) {
      return NextResponse.json(
        {
          success: false,
          error:
            "An account already uses that email or mobile number. Try signing in instead.",
        },
        { status: 409 },
      );
    }
    console.error("[api/auth/signup]", error);
    return NextResponse.json(
      { success: false, error: "Could not create your account. Try again." },
      { status: 500 },
    );
  }
}
