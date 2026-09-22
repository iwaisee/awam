import { NextResponse } from "next/server";
import { readRegistry, resetRegistry, writeRegistry } from "@/lib/departmentsDb";
import type { CoreSector } from "@/data/departmentRegistry";

/* Registry transport — GET/PUT/DELETE for the single departments registry
   document. The Neon `registry` table is the only source: an unsaved store
   serves an empty roster with `seeded: false` (clients render their loading /
   empty states — no built-in fallback roster exists). */

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
  const saved = await readRegistry();
  if (isValidRegistry(saved)) {
    return NextResponse.json({ sectors: saved, seeded: true });
  }
  return NextResponse.json({ sectors: [], seeded: false });
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
    await writeRegistry(body.sectors);
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
  await resetRegistry();
  return NextResponse.json({ success: true });
}
