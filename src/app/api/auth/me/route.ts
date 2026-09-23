import { NextResponse } from "next/server";
import {
  DuplicateContactError,
  updateCitizenSettings,
} from "@/lib/auth/usersDb";
import { verifySession } from "@/lib/auth/session";
import { buildSessionPayload } from "@/lib/auth/payload";
import {
  fieldErrorsFrom,
  settingsDocumentSchema,
} from "@/lib/auth/schemas";
import type { CitizenProfileSettings } from "@/types/civic";

/* The signed-in citizen's own record.

   GET answers 200 either way — "not signed in" is a state the client has to
   render, not a failed request. PUT is the citizen's only write path for their
   profile, and it is a no-auth 401 without a valid session: the account id is
   read from the cookie, never from the body, so one citizen cannot write over
   another's document the way the old shared app_state record allowed. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await verifySession();
    if (!user) {
      return NextResponse.json({ success: true, authenticated: false });
    }
    return NextResponse.json({
      success: true,
      authenticated: true,
      ...(await buildSessionPayload(user)),
    });
  } catch (error) {
    console.error("[api/auth/me] GET", error);
    return NextResponse.json(
      { success: false, error: "Could not load your account." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const user = await verifySession();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Sign in to update your profile." },
      { status: 401 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = settingsDocumentSchema.safeParse(body);
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
    const settings = await updateCitizenSettings(
      user,
      parsed.data as Partial<CitizenProfileSettings>,
    );
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    if (error instanceof DuplicateContactError) {
      return NextResponse.json(
        {
          success: false,
          error: "Another account already uses that mobile number.",
        },
        { status: 409 },
      );
    }
    console.error("[api/auth/me] PUT", error);
    return NextResponse.json(
      { success: false, error: "Could not save your profile." },
      { status: 500 },
    );
  }
}
