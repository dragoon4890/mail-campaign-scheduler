import { ComposePageClient } from "@/components/ComposePageClient";
import { fetchSenders } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ComposePage() {
  const senders = await fetchSenders().catch(() => []);
  return <ComposePageClient senders={senders} />;
}
