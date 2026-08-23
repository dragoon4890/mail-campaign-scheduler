import { EmailList, Toolbar } from "@/components/EmailList";
import { fetchList } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ScheduledPage() {
  const data = await fetchList("scheduled").catch(() => ({
    emails: [],
    count: 0,
    status: "scheduled",
  }));

  return (
    <div className="mx-auto max-w-[900px]">
      <Toolbar />
      <EmailList rows={data.emails} kind="scheduled" />
    </div>
  );
}
