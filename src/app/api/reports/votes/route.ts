import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";
import { listReportVotes } from "@/lib/reportsDb";

/* The signed-in citizen's vote record — which tickets they have confirmed, as
   tracking tokens (the ids the feed's cards key on). Signed-out callers get an
   empty list rather than an error: "you have confirmed nothing" is the correct
   answer for a fresh visitor, so the feed needs no special case. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await verifySession();
  if (!user) return NextResponse.json({ votedTokens: [] });
  return NextResponse.json({ votedTokens: await listReportVotes(user.id) });
}
