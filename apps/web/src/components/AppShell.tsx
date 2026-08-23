"use client";

import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import type { Stats } from "@/lib/api";
import type { SessionUser } from "@/lib/session";

export function AppShell({
  user,
  stats,
  children,
}: {
  user: SessionUser;
  stats: Stats;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar
        user={user}
        stats={stats}
        onCompose={() => router.push("/compose")}
      />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
