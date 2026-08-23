import { EmailList, Toolbar } from "@/components/EmailList";
import { fetchList } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function SentPage() {
  const data = await fetchList("sent").catch(() => ({
    emails: [],
    count: 0,
    status: "sent",
  }));

  return (
    <div className="mx-auto max-w-[900px]">
      <Toolbar />
      <EmailList rows={data.emails} kind="sent" />
    </div>
  );
}
