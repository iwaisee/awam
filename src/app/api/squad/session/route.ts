import { NextResponse } from "next/server";
import {
  bindSquadSession,
  readSquadSession,
  setSquadAvailability,
  SQUAD_AVAILABILITY,
  unbindSquadSession,
  type SquadAvailability,
} from "@/lib/squadPortal";

/* Field-squad session transport for the /squad field console.
   GET    → the bound session (metadata re-resolved from the live registry), or null.
   POST   → bind the console to a real registry squad { squadId }.
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
    const body = (await request.json()) as { squadId?: unknown };
    if (typeof body.squadId !== "string" || !body.squadId.trim()) {
      return NextResponse.json(
        { success: false, error: "Missing squadId." },
        { status: 400 },
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
