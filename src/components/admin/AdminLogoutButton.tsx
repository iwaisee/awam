"use client";

import { LogOut } from "lucide-react";
import { adminLogoutAction } from "@/app/admin/login/actions";

/* Terminates the officer's session: the server action expires the
   path-scoped sada_admin_token cookie and lands on the admin sign-in screen.
   A plain form keeps it working even before hydration finishes. */

export default function AdminLogoutButton() {
  return (
    <form action={adminLogoutAction}>
      <button
        type="submit"
        title="End session and return to the admin sign-in"
        className="flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
      >
        <LogOut className="h-3.5 w-3.5" />
        Sign Out
      </button>
    </form>
  );
}
