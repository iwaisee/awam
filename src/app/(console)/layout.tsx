import { redirect } from "next/navigation";
import { verifyAdminSession } from "@/lib/adminAuth";

/* The console's real gate. proxy.ts can only see that a session cookie exists;
   whether the row behind it is still alive is a database question, and this is
   where it gets asked — the same split the citizen dashboard uses in
   src/app/(public)/settings/layout.tsx.

   The admin shell below is a client component, so the verdict has to be made
   here rather than inside it. verifyAdminSession is memoised per request, so
   pages underneath reuse this lookup instead of querying again. */

export default async function ConsoleGate({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await verifyAdminSession())) {
    redirect("/admin/login");
  }
  return children;
}
