"use client";

import { useState } from "react";
import { ComposeModal } from "@/components/ComposeModal";
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
  const [composeOpen, setComposeOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar user={user} stats={stats} onCompose={() => setComposeOpen(true)} />
      <main className="flex-1 p-6">{children}</main>
      <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} />
    </div>
  );
}
