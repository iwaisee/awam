"use client";

/* Read point for the government departments registry — the same store the
   /admin/departments console owns. The registry lives server-side (Neon,
   shared by every browser); this hook re-syncs on a 60s poll, whenever the
   console saves (REGISTRY_UPDATED_EVENT), and on mount. Read-only: the
   overview and field-gateway surfaces never write; the departments console
   remains the single editor. There is no local seed — gate first paints on
   `loaded`. */

import { useEffect, useState } from "react";
import type { CoreSector } from "@/data/departmentRegistry";
import { fetchRegistry, REGISTRY_UPDATED_EVENT } from "@/lib/registryClient";

export function useDepartmentRegistry(): {
  sectors: CoreSector[];
  loaded: boolean;
} {
  const [sectors, setSectors] = useState<CoreSector[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchRegistry()
        .then(({ sectors: remote }) => {
          if (!cancelled) {
            setSectors(remote);
            setLoaded(true);
          }
        })
        .catch(() => {
          /* server unreachable — keep the current view */
          if (!cancelled) setLoaded(true);
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

  return { sectors, loaded };
}
