"use client";

/* Read point for the government departments registry — the same store the
   /admin/departments console owns. The registry lives server-side (Neon,
   shared by every browser); this hook re-syncs on a 60s poll, whenever the
   console saves (REGISTRY_UPDATED_EVENT), and on mount. Read-only: the
   overview and field-gateway surfaces never write; the departments console
   remains the single editor. There is no local seed — gate first paints on
   `loaded`.

   One store, many readers: several decks mount at once (the overview card
   renders the sector grid and then the modal inside it), so the snapshot,
   the poll and the event subscription live at module level and every
   consumer subscribes to it. Per-component state would give each reader its
   own request and its own 60s timer. */

import { useSyncExternalStore } from "react";
import type { CoreSector } from "@/data/departmentRegistry";
import { fetchRegistry, REGISTRY_UPDATED_EVENT } from "@/lib/registryClient";

interface RegistrySnapshot {
  sectors: CoreSector[];
  loaded: boolean;
}

const POLL_INTERVAL = 60_000;

let snapshot: RegistrySnapshot = { sectors: [], loaded: false };
const listeners = new Set<() => void>();
let timer: number | undefined;

function setSnapshot(next: RegistrySnapshot): void {
  snapshot = next;
  for (const notify of listeners) notify();
}

async function load(): Promise<void> {
  try {
    const { sectors } = await fetchRegistry();
    setSnapshot({ sectors, loaded: true });
  } catch {
    // server unreachable — keep the current view, but stop gating on it
    setSnapshot({ ...snapshot, loaded: true });
  }
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  if (listeners.size === 1) {
    void load();
    if (typeof window !== "undefined") {
      timer = window.setInterval(load, POLL_INTERVAL);
      window.addEventListener(REGISTRY_UPDATED_EVENT, load);
    }
  }
  return () => {
    listeners.delete(notify);
    if (listeners.size === 0 && typeof window !== "undefined") {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
      window.removeEventListener(REGISTRY_UPDATED_EVENT, load);
    }
  };
}

export function useDepartmentRegistry(): RegistrySnapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}
