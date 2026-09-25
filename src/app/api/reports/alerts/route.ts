import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import {
  getReportByIdOrToken,
  getReportEmailAlert,
  setReportEmailAlert,
} from "@/lib/reportsDb";

/* Per-ticket "email me when this issue is resolved" switches, stored per
   account in the report_alerts table — the dossier's toggle is the UI for
   these rows, so the preference survives reloads and devices like the votes
   do. Signed-out callers read `false` (no alerts are theirs to configure);
   writes require a session. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const normalizeId = (raw: string | null | undefined): string =>
  typeof raw === "string" ? raw.trim().replace("#", "").toUpperCase() : "";

/** GET ?id=<ticket token> — the signed-in citizen's switch for one ticket. */
export async function GET(request: Request) {
  const user = await verifySession();
  if (!user) return NextResponse.json({ enabled: false });
  const id = normalizeId(new URL(request.url).searchParams.get("id"));
  const report = id ? await getReportByIdOrToken(id) : null;
  if (!report) return NextResponse.json({ enabled: false });
  return NextResponse.json({
    enabled: await getReportEmailAlert(report.id, user.id),
  });
}

/** PUT { id, enabled } — flips the switch. */
export async function PUT(request: Request) {
  const user = await verifySession();
  if (!user) {
    return NextResponse.json(
      {
        success: false,
        error: "Sign in to manage email alerts.",
        code: "AUTH_REQUIRED",
      },
      { status: 401 },
    );
  }
  const body = (await request.json().catch(() => null)) as {
    id?: unknown;
    enabled?: unknown;
  } | null;
  const id = normalizeId(typeof body?.id === "string" ? body.id : null);
  if (!id || typeof body?.enabled !== "boolean") {
    return NextResponse.json(
      { success: false, error: "Missing report id or enabled flag." },
      { status: 400 },
    );
  }
  const report = await getReportByIdOrToken(id);
  if (!report) {
    return NextResponse.json(
      { success: false, error: `No report found for ${id}.` },
      { status: 404 },
    );
  }
  await setReportEmailAlert(report.id, user.id, body.enabled);
  return NextResponse.json({ success: true, enabled: body.enabled });
}
