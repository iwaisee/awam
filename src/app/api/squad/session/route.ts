import { NextResponse } from "next/server";
import {
  bindSquadSession,
  readSquadSession,
  setSquadAvailability,
  SQUAD_AVAILABILITY,
  unbindSquadSession,
  type SquadAvailability,
} from "@/lib/squadPortal";
import { verifySquadAccess } from "@/lib/squadAccess";

/* Field-squad session transport for the /squad field console.
   GET    → the bound session (metadata re-resolved from the live registry), or null.
   POST   → sign in: verify the officer's squad access code, then bind the
            console to that registry squad { squadId, pin }.
   PATCH  → flip field availability { availability } — also mirrored into the
            departments registry so the admin roster follows the officer.
   DELETE → unbind (officer signs off the device). */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ session: readSquadSession() });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      squadId?: unknown;
      pin?: unknown;
    };
    if (typeof body.squadId !== "string" || !body.squadId.trim()) {
      return NextResponse.json(
        { success: false, error: "Missing squadId." },
        { status: 400 },
      );
    }
    if (typeof body.pin !== "string" || !body.pin.trim()) {
      return NextResponse.json(
        { success: false, error: "Enter the squad access code to sign in." },
        { status: 400 },
      );
    }
    const verdict = verifySquadAccess(body.squadId.trim(), body.pin);
    if (!verdict.ok) {
      if (verdict.reason === "no_code_issued") {
        return NextResponse.json(
          {
            success: false,
            error:
              "No access code has been issued for this squad yet — ask the control room to issue one from the Field Teams console.",
          },
          { status: 403 },
        );
      }
      if (verdict.reason === "locked") {
        const seconds = Math.ceil((verdict.retryAfterMs ?? 0) / 1000);
        return NextResponse.json(
          {
            success: false,
            error: `Too many wrong attempts — locked for ${seconds}s. Wait, then try again.`,
          },
          { status: 429 },
        );
      }
      return NextResponse.json(
        { success: false, error: "Wrong access code for this squad." },
        { status: 401 },
      );
    }
    const session = bindSquadSession(body.squadId.trim());
    return NextResponse.json({ success: true, session });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not bind squad session.";
    const notFound = message.startsWith("No field squad found");
    return NextResponse.json(
      { success: false, error: message },
      { status: notFound ? 404 : 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { availability?: unknown };
    if (
      typeof body.availability !== "string" ||
      !(body.availability in SQUAD_AVAILABILITY)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid availability. Expected one of: ${Object.keys(SQUAD_AVAILABILITY).join(", ")}.`,
        },
        { status: 400 },
      );
    }
    const session = setSquadAvailability(body.availability as SquadAvailability);
    return NextResponse.json({ success: true, session });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not update squad availability.";
    const noSession = message.startsWith("No squad session");
    return NextResponse.json(
      { success: false, error: message },
      { status: noSession ? 409 : 500 },
    );
  }
}

export async function DELETE() {
  unbindSquadSession();
  return NextResponse.json({ success: true });
}
