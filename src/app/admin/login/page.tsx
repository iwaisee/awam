import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { verifyAdminSession } from "@/lib/adminAuth";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Admin Console | Sada-e-Awam",
  robots: { index: false, follow: false },
};

/* Standalone admin sign-in surface. Lives outside the (console) route group on
   purpose: no sidebar, no citizen chrome, no shared layout — the console shell
   only renders for an authenticated officer. The ?redirect= deep link set by
   the proxy is passed down as a plain prop so the form can round-trip it.

   Sending an already-cleared officer away is decided here rather than in
   proxy.ts because only the database can tell a live session from a stale
   cookie — the proxy has to let this page render either way. */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect: target } = await searchParams;
  if (await verifyAdminSession()) redirect("/admin");
  return <LoginForm redirect={target ?? null} />;
}
