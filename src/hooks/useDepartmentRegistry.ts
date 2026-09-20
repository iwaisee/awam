"use client";

/* Read point for the government departments registry — the same store the
   /admin/departments console owns. The registry lives server-side (shared by
   every browser); this hook re-syncs on a 60s poll, whenever the console
   saves (REGISTRY_UPDATED_EVENT), and on mount. Read-only: the overview and
   field-gateway surfaces never write; the departments console remains the
   single editor. */

import { useEffect, useState } from "react";
import { DEPARTMENT_SECTORS, type CoreSector } from "@/data/departmentRegistry";
import { fetchRegistry, REGISTRY_UPDATED_EVENT } from "@/lib/registryClient";

export function useDepartmentRegistry(): { sectors: CoreSector[] } {
  const [sectors, setSectors] = useState<CoreSector[]>(DEPARTMENT_SECTORS);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchRegistry()
        .then(({ sectors: remote }) => {
          if (!cancelled) setSectors(remote);
        })
        .catch(() => {
          /* server unreachable — keep the current view */
        });
    };
    load();
    const timer = window.setInterval(load, 60_000);
    window.addEventListener(REGISTRY_UPDATED_EVENT, load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(REGISTRY_UPDATED_EVENT, load);
    };
  }, []);

  return { sectors };
}
