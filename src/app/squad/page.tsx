import type { Metadata } from "next";
import SquadPortal from "@/components/squad/SquadPortal";

/* /squad — Field Squad Operations Portal. A mobile-first field console bound
   to one real squad from the departments registry; all tickets, KPIs and
   resolution proof flows read and write the live SQLite report ledger. */

export const metadata: Metadata = {
  title: "Field Squad Operations • Sada-e-Awam",
  description:
    "Live dispatch queue, resolution proof uploads and field telemetry for Sada-e-Awam response squads.",
};

export default function SquadPage() {
  return <SquadPortal />;
}
