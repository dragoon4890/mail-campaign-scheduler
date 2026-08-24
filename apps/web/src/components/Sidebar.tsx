"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  ClockIcon,
  SendIcon,
  ChevronDownIcon,
} from "@/components/icons";
import type { Stats } from "@/lib/api";
import type { SessionUser } from "@/lib/session";

function NavItem({
  href,
  icon,
  label,
  count,
  active,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-between rounded-lg px-2 py-2 text-sm ${
        active ? "bg-green-100 text-gray-900" : "text-gray-600 hover:bg-gray-50"
      }`}
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <span className="text-xs text-gray-500">{count}</span>
    </Link>
  );
}

export function Sidebar({
  user,
  stats,
  onCompose,
}: {
  user: SessionUser;
  stats: Stats;
  onCompose: () => void;
}) {
  const pathname = usePathname();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const initials = (user.name ?? "U")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside className="flex w-[230px] shrink-0 flex-col border-r border-gray-100 p-4">
      <h1 className="px-2 pb-4 text-2xl font-black tracking-widest [font-family:var(--font-pixel)]">
        ONB
      </h1>

      <div className="relative">
        <button
          onClick={() => setUserMenuOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-gray-50"
        >
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt={user.name ?? "avatar"}
              className="h-8 w-8 shrink-0 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">
              {initials}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-gray-900">
              {user.name}
            </span>
            <span className="block truncate text-xs text-gray-400">{user.email}</span>
          </span>
          <ChevronDownIcon className="h-4 w-4 shrink-0 text-gray-400" />
        </button>
        {userMenuOpen && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            <button
              onClick={() => void signOut({ callbackUrl: "/" })}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              Log out
            </button>
          </div>
        )}
      </div>

      <button
        onClick={onCompose}
        className="mt-3 h-9 rounded-full border border-green-600 text-sm font-medium text-green-600 hover:bg-green-50"
      >
        Compose
      </button>

      <p className="mb-1 mt-5 px-2 text-[10px] font-medium uppercase tracking-wider text-gray-400">
        Core
      </p>
      <nav className="flex flex-col gap-0.5">
        <NavItem
          href="/"
          icon={<ClockIcon className="h-4 w-4" />}
          label="Scheduled"
          count={stats.scheduled}
          active={pathname === "/"}
        />
        <NavItem
          href="/sent"
          icon={<SendIcon className="h-4 w-4" />}
          label="Sent"
          count={stats.sent}
          active={pathname === "/sent"}
        />
      </nav>
    </aside>
  );
}
