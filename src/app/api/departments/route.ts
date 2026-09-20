import { NextResponse } from "next/server";
import { readRegistry, resetRegistry, writeRegistry } from "@/lib/departmentsDb";
import {
  DEPARTMENT_SECTORS,
  type CoreSector,
} from "@/data/departmentRegistry";

/* Registry transport — GET/PUT/DELETE for the single departments registry
   document. GET falls back to the built-in seed until something is saved,
   with `seeded` telling clients whether a localStorage migration should run.
   DELETE is a dev-only reset so a browser's localStorage registry can be
   re-migrated after testing. */

function isValidRegistry(value: unknown): value is CoreSector[] {
  return (
    Array.isArray(value) &&
    value.every(
      (sec) =>
        typeof (sec as { id?: unknown })?.id === "string" &&
        typeof (sec as { name?: unknown })?.name === "string" &&
        Array.isArray((sec as { agencies?: unknown })?.agencies)
    )
  );
}

export async function GET() {
  const saved = readRegistry();
  if (isValidRegistry(saved)) {
    return NextResponse.json({ sectors: saved, seeded: true });
  }
  return NextResponse.json({ sectors: DEPARTMENT_SECTORS, seeded: false });
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { sectors?: unknown };
    if (!isValidRegistry(body.sectors)) {
      return NextResponse.json(
        { success: false, error: "Invalid registry payload." },
        { status: 400 },
      );
    }
    writeRegistry(body.sectors);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? `Could not save registry: ${error.message}`
            : "Could not save registry.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { success: false, error: "Not available in production." },
      { status: 403 },
    );
  }
  resetRegistry();
  return NextResponse.json({ success: true });
}
