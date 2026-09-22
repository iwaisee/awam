import WizardShell from "@/components/WizardShell";
import { DEPARTMENTS } from "@/data/departmentDirectory";
import { CATEGORY_META } from "@/types/report";

export const metadata = {
  title: "Report an Issue | Sada-e-Awam",
  description:
    "File a verified civic report for your area in Sialkot — takes 60 seconds.",
};

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; city?: string; dept?: string }>;
}) {
  const { category, city, dept } = await searchParams;

  let initialCategory: string | null = null;
  if (category && category in CATEGORY_META) {
    initialCategory = category;
  } else if (dept) {
    const match = DEPARTMENTS.find((d) => d.key === dept);
    initialCategory = match ? match.preselectCategory : null;
  }

  // City pre-selection is validated client-side against the live coverage
  // dataset (CoverageContext), so cities added in /admin are accepted too.
  const initialCity = city?.trim() || null;

  return (
    <WizardShell initialCategory={initialCategory} initialCity={initialCity} />
  );
}
