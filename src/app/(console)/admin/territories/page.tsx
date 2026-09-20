import { redirect } from "next/navigation";

/* /admin/territories — the section entry point lands on the Province manager. */
export default function TerritoriesIndexPage() {
  redirect("/admin/territories/provinces");
}
