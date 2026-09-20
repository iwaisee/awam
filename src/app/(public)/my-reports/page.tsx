import { redirect } from "next/navigation";

/* My Reports lives inside the Account & Settings dashboard
   (/settings?tab=reports) so the sidebar layout persists across the citizen
   views. This URL redirects so existing links and bookmarks keep working. */
export default function MyReportsRedirectPage() {
  redirect("/settings?tab=reports");
}
