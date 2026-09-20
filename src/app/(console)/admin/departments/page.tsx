"use client";

/* /admin/departments — Government Department & Team Manager:
   3-tier sector → agency → district desk / field squad console.
   Selection rides the URL (?sector=power&agency=gepco) following the
   territories deep-link pattern, so agency decks are shareable. */

import { Suspense } from "react";
import DepartmentManager from "@/components/admin/DepartmentManager";

function DepartmentsPageInner() {
  return <DepartmentManager />;
}

export default function DepartmentsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-140px)] items-center justify-center">
          <div className="h-40 w-full max-w-3xl animate-pulse rounded-2xl border border-slate-200 bg-white" />
        </div>
      }
    >
      <DepartmentsPageInner />
    </Suspense>
  );
}
