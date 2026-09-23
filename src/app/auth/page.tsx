import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import UnifiedCitizenAuth from "@/components/auth/UnifiedCitizenAuth";
import { UserProvider } from "@/context/UserContext";
import { verifySession } from "@/lib/auth/session";
import { safeReturnPath } from "@/lib/auth/returnPath";

export const metadata: Metadata = {
  title: "Sada-e-Awam • صدائے عوام | Citizen Sign In",
  description:
    "Sign in or create your verified citizen account on Sada-e-Awam (صدائے عوام) — Punjab's digital civic portal. File and track verified civic reports; live in Sialkot.",
};

/** Skeleton mirrored off the split auth layout so the Suspense gap (the card
    reads ?redirect/?mode via useSearchParams, which bails out of prerendering)
    reads as a loading state instead of a blank flash. */
function AuthFallback() {
  return (
    <main className="grid min-h-screen bg-slate-50 lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-emerald-950 p-10 lg:block xl:p-14">
        <div className="animate-pulse space-y-4">
          <div className="h-7 w-52 rounded-lg bg-white/10" />
          <div className="h-3 w-72 rounded bg-white/10" />
          <div className="h-24 w-4/5 rounded-2xl bg-white/10" />
          <div className="h-44 w-full rounded-2xl bg-white/10" />
        </div>
      </aside>
      <div className="flex items-center justify-center p-4 sm:p-6 lg:p-10">
        <div className="w-full max-w-md animate-pulse space-y-4 rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-7">
          <div className="h-11 w-full rounded-2xl bg-slate-100" />
          <div className="h-4 w-64 rounded bg-slate-100" />
          <div className="space-y-3">
            <div className="h-14 w-full rounded-xl bg-slate-100" />
            <div className="h-14 w-full rounded-xl bg-slate-100" />
            <div className="h-10 w-full rounded-2xl bg-slate-100" />
          </div>
        </div>
      </div>
    </main>
  );
}

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  // A citizen with a live session has nothing to sign in to. Proxy only skips
  // this for a cookie it cannot verify, so the check happens here — and the
  // ?redirect target still wins, so a stale sign-in tab lands in the wizard.
  if (await verifySession()) {
    const { redirect: target } = await searchParams;
    redirect(safeReturnPath(target));
  }

  // Own UserProvider locally: /auth sits outside the (public) layout, and the
  // card writes the authenticated identity into the citizen document.
  return (
    <UserProvider>
      <Suspense fallback={<AuthFallback />}>
        <UnifiedCitizenAuth />
      </Suspense>
    </UserProvider>
  );
}
