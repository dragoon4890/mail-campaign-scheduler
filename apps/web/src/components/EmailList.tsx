import { SearchIcon, FilterIcon, RefreshIcon, ClockIcon, SendIcon, StarIcon } from "@/components/icons";
import type { EmailRow } from "@/lib/api";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function Toolbar() {
  return (
    <div className="mb-2 flex items-center gap-3">
      <div className="flex h-10 flex-1 items-center gap-2 rounded-full bg-gray-100 px-4 text-sm text-gray-400">
        <SearchIcon className="h-4 w-4" />
        <input
          placeholder="Search"
          className="w-full bg-transparent outline-none placeholder:text-gray-400"
        />
      </div>
      <button className="text-gray-400 hover:text-gray-600" aria-label="Filter">
        <FilterIcon className="h-5 w-5" />
      </button>
      <button className="text-gray-400 hover:text-gray-600" aria-label="Refresh">
        <RefreshIcon className="h-5 w-5" />
      </button>
    </div>
  );
}

export function EmailList({
  rows,
  kind,
}: {
  rows: EmailRow[];
  kind: "scheduled" | "sent";
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        {kind === "scheduled" ? (
          <ClockIcon className="mb-3 h-8 w-8 text-gray-300" />
        ) : (
          <SendIcon className="mb-3 h-8 w-8 text-gray-300" />
        )}
        <p className="text-sm font-medium text-gray-500">
          {kind === "scheduled" ? "No scheduled emails" : "No sent emails"}
        </p>
        <p className="mt-1 text-xs text-gray-400">
          {kind === "scheduled"
            ? "Use Compose to schedule your first batch."
            : "Sent emails will appear here after they go out."}
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-3 py-4 pr-2 text-sm">
          <span className="w-[140px] shrink-0 truncate font-semibold text-gray-900">
            To: {row.toEmail}
          </span>

          {kind === "scheduled" ? (
            <span className="flex shrink-0 items-center gap-1 rounded-md bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
              <ClockIcon className="h-3 w-3" />
              {formatWhen(row.scheduledAt)}
            </span>
          ) : (
            <span className="shrink-0 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
              Sent
            </span>
          )}

          <span className="min-w-0 truncate">
            <span className="font-semibold text-gray-900">{row.subject}</span>
            <span className="text-gray-400"> - {row.preview}</span>
          </span>

          <button className="ml-auto shrink-0 text-gray-300 hover:text-yellow-400" aria-label="Star">
            <StarIcon className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
