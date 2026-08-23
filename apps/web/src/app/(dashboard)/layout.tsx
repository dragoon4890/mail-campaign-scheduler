import { AppShell } from "@/components/AppShell";
import { getSessionUser } from "@/lib/session";
import { fetchStats } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user = await getSessionUser();
  if (!user) user = { name: "Dev User", email: "dev@local", dev: true };

  let stats = { scheduled: 0, sent: 0, failed: 0 };
  try {
    stats = await fetchStats();
  } catch {
    // api down: sidebar renders with zeros rather than crashing the shell
  }

  return (
    <AppShell user={user} stats={stats}>
      {children}
    </AppShell>
  );
}
