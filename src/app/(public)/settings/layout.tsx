import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/session";
import { signInHref } from "@/lib/auth/returnPath";

/* The account dashboard is, by definition, an account view: everything in it
   (profile, privacy, My Reports, the civic dossier export) is one citizen's own
   record. The page below is a client component, so the verdict is made here,
   where the session cookie can actually be verified against the database.

   Proxy already carries ?tab= through sign-in for the normal case; reaching
   this branch means a cookie that no longer maps to a session, so the citizen
   lands on the dashboard's default tab. */

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await verifySession())) {
    redirect(signInHref("/settings"));
  }
  return children;
}
