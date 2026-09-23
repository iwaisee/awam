import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Admin Console | Sada-e-Awam",
  robots: { index: false, follow: false },
};

/* Standalone admin sign-in surface. Lives outside the (console) route group on
   purpose: no sidebar, no citizen chrome, no shared layout — the console shell
   only renders for an authenticated officer. The ?redirect= deep link set by
   the proxy is passed down as a plain prop so the form can round-trip it. */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;
  return <LoginForm redirect={redirect ?? null} />;
}
