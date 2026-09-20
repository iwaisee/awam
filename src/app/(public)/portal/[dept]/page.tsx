import { notFound } from "next/navigation";
import PortalClient from "./PortalClient";
import { PORTAL_DEPTS } from "@/data/operationsData";
import type { PortalDeptKey } from "@/data/operationsData";

export function generateStaticParams() {
  return PORTAL_DEPTS.map((dept) => ({ dept: dept.key }));
}

export default async function PortalPage({
  params,
}: {
  params: Promise<{ dept: string }>;
}) {
  const { dept } = await params;
  const valid = PORTAL_DEPTS.some((d) => d.key === dept);
  if (!valid) notFound();

  return <PortalClient deptKey={dept as PortalDeptKey} />;
}
