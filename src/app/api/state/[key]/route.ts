import { NextResponse } from "next/server";
import { readState, writeState } from "@/lib/appStateDb";

/* Shared application state transport. Keys are whitelisted — anything a
   browser can push must be a documented shared document.

   "citizen-profile" is gone from this list on purpose: it was one global
   document that every browser read and overwrote, so a citizen's settings were
   visible to (and replaceable by) everyone. A citizen's own record now lives on
   their account row and moves through the authenticated /api/auth/me. */

const ALLOWED_KEYS = new Set([
  "coverage",
  "system-prefs",
  "admin-profile",
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json(
      { success: false, error: "Unknown state key." },
      { status: 404 },
    );
  }
  const value = await readState(key);
  return NextResponse.json({ value, seeded: value !== null });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json(
      { success: false, error: "Unknown state key." },
      { status: 404 },
    );
  }
  try {
    const body = (await request.json()) as { value?: unknown };
    if (typeof body.value === "undefined") {
      return NextResponse.json(
        { success: false, error: "Missing state value." },
        { status: 400 },
      );
    }
    const serialized = JSON.stringify(body.value);
    if (serialized.length > 8_000_000) {
      return NextResponse.json(
        { success: false, error: "State value too large." },
        { status: 413 },
      );
    }
    await writeState(key, body.value);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? `Could not save state: ${error.message}`
            : "Could not save state.",
      },
      { status: 500 },
    );
  }
}
