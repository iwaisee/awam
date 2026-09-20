import { NextResponse } from "next/server";
import { readState, writeState } from "@/lib/appStateDb";

/* Launch-waitlist signups — shared server-side so every signup collected from
   any browser lands in one list. */

const WAITLIST_KEY = "waitlist";

interface CityWaitlistEntry {
  city: string;
  city_name: string;
  phone: string;
  area?: string;
  timestamp: string;
}

function readList(): CityWaitlistEntry[] {
  const parsed = readState(WAITLIST_KEY);
  return Array.isArray(parsed) ? (parsed as CityWaitlistEntry[]) : [];
}

export async function GET() {
  return NextResponse.json({ entries: readList() });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<CityWaitlistEntry>;
    const entry: CityWaitlistEntry = {
      city: typeof body.city === "string" ? body.city.slice(0, 60) : "",
      city_name: typeof body.city_name === "string" ? body.city_name.slice(0, 80) : "",
      phone: typeof body.phone === "string" ? body.phone.slice(0, 30) : "",
      area: typeof body.area === "string" ? body.area.slice(0, 120) : undefined,
      timestamp:
        typeof body.timestamp === "string" ? body.timestamp : new Date().toISOString(),
    };
    if (!entry.city || !entry.phone) {
      return NextResponse.json(
        { success: false, error: "City and phone are required." },
        { status: 400 },
      );
    }
    const list = readList();
    // One signup per phone per city — repeat submits refresh the timestamp.
    const deduped = list.filter(
      (e) => !(e.phone === entry.phone && e.city === entry.city)
    );
    deduped.push(entry);
    writeState(WAITLIST_KEY, deduped);
    return NextResponse.json({ success: true, entries: deduped.length });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? `Could not save signup: ${error.message}`
            : "Could not save signup.",
      },
      { status: 500 },
    );
  }
}
