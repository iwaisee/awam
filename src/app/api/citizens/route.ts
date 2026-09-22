import { NextResponse } from "next/server";
import { listReports } from "@/lib/reportsDb";
import {
  listCitizenAdminStates,
  updateCitizenAdminState,
} from "@/lib/citizensDb";
import {
  deriveCitizenProfiles,
  type CitizenStanding,
} from "@/lib/citizenProfiles";

/* Citizen ledger for the admin console. Citizens are DERIVED from the real
   reports ledger (a citizen = the name/phone behind one or more submissions),
   merged with the admin governance state stored in the citizen_admin table.
   GET returns the derived profiles; PATCH persists a governance action
   (badge override, score modifier, suspend/reactivate, blacklist). */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const [reports, adminStates] = await Promise.all([
    listReports(),
    listCitizenAdminStates(),
  ]);
  const profiles = deriveCitizenProfiles(reports, adminStates);
  return NextResponse.json(profiles);
}

const STANDINGS: CitizenStanding[] = ["active", "suspended"];

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      key?: unknown;
      badge_override?: unknown;
      score_modifier?: unknown;
      standing?: unknown;
      blacklisted?: unknown;
    };

    const key = typeof body.key === "string" ? body.key.trim() : "";
    if (!key) {
      return NextResponse.json(
        { success: false, error: "Missing citizen key." },
        { status: 400 },
      );
    }
    if (
      body.standing !== undefined &&
      !STANDINGS.includes(body.standing as CitizenStanding)
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid standing. Expected active or suspended." },
        { status: 400 },
      );
    }

    const next = await updateCitizenAdminState(key, {
      badgeOverride:
        typeof body.badge_override === "boolean" ? body.badge_override : undefined,
      scoreModifier:
        typeof body.score_modifier === "number" && Number.isFinite(body.score_modifier)
          ? Math.round(body.score_modifier)
          : undefined,
      standing:
        typeof body.standing === "string"
          ? (body.standing as CitizenStanding)
          : undefined,
      blacklisted:
        typeof body.blacklisted === "boolean" ? body.blacklisted : undefined,
    });

    return NextResponse.json({ success: true, admin: next });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? `Could not update citizen: ${error.message}`
            : "Could not update citizen.",
      },
      { status: 500 },
    );
  }
}
