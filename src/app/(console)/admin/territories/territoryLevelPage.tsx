"use client";

/* Shared wrapper for the three territory level pages. Each level is its own
   route and the URL search params are the selection state:
     /provinces?province=punjab              → Province focus deck
     /cities?province=punjab                 → Districts, Punjab-scoped
     /cities?province=punjab&district=sialkot → District focus deck
     /zones?district=sialkot&zone=cantt      → Zone focus deck
     ...&locality=<areaId>                   → Locality focus deck
     ?add=district|zone|locality|province    → pre-scoped creation modal */

import { Suspense } from "react";
import { useConsoleNav } from "../consoleContext";
import TerritoriesView from "../views/TerritoriesView";
import type { TerritoryRouteLevel } from "@/lib/territoryUrl";

function TerritoryLevelInner({ level }: { level: TerritoryRouteLevel }) {
  const { onNodeNavigate } = useConsoleNav();
  return <TerritoriesView level={level} onNodeNavigate={onNodeNavigate} />;
}

export function TerritoryLevelPage({ level }: { level: TerritoryRouteLevel }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center">
          <div className="h-40 w-full max-w-3xl animate-pulse rounded-2xl border border-slate-200 bg-white" />
        </div>
      }
    >
      <TerritoryLevelInner level={level} />
    </Suspense>
  );
}
