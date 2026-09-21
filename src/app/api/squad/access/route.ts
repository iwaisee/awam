import { NextResponse } from "next/server";
import {
  ACCESS_CODE_PATTERN,
  accessCodeStatus,
  clearAccessCode,
  setAccessCode,
} from "@/lib/squadAccess";

/* Squad access-code management — the credential store behind the /squad
   sign-in. GET ?ids=a,b,c → which of those squads have a code issued
   (booleans only, never the codes themselves). PUT { squadId, code } issues
   or rotates a code; DELETE ?squadId= revokes it. The Field Teams console
   calls PUT when a crew is registered or edited; codes live server-side in
   the app-state store and are never rendered back to any browser. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 200);
  return NextResponse.json({ hasCode: accessCodeStatus(ids) });
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { squadId?: unknown; code?: unknown };
    if (typeof body.squadId !== "string" || !body.squadId.trim()) {
      return NextResponse.json(
        { success: false, error: "Missing squadId." },
        { status: 400 },
      );
    }
    if (typeof body.code !== "string" || !ACCESS_CODE_PATTERN.test(body.code.trim())) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Access code must be 4-12 letters, numbers or dashes (no spaces).",
        },
        { status: 400 },
      );
    }
    setAccessCode(body.squadId.trim(), body.code);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not save the access code.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const squadId = url.searchParams.get("squadId")?.trim();
  if (!squadId) {
    return NextResponse.json(
      { success: false, error: "Missing squadId." },
      { status: 400 },
    );
  }
  clearAccessCode(squadId);
  return NextResponse.json({ success: true });
}
