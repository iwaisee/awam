import { NextResponse } from "next/server";
import { readCoverageDoc, writeCoverageDoc } from "@/lib/territoriesDb";

/* Territory/coverage transport — the normalized Neon store behind the same
   whole-document contract the admin consoles already speak. GET assembles
   { cities, categories, provinces } from the provinces/cities/zones/areas/
   category_rules tables (`seeded` false until the first sync); PUT persists
   the whole document authoritatively. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const value = await readCoverageDoc();
  return NextResponse.json({ value, seeded: value !== null });
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { value?: unknown };
    if (typeof body.value !== "object" || body.value === null) {
      return NextResponse.json(
        { success: false, error: "Missing coverage value." },
        { status: 400 },
      );
    }
    await writeCoverageDoc(body.value);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not save territories.";
    const badPayload = message.startsWith("Malformed coverage document");
    return NextResponse.json(
      { success: false, error: message },
      { status: badPayload ? 400 : 500 },
    );
  }
}
