import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchEmail } from "@/lib/api";
import { StarIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

function ArchiveIconWrapper() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
      <path d="M10 13h4" />
    </svg>
  );
}

function TrashIconWrapper() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

export default async function EmailDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const email = await fetchEmail(id).catch(() => null);
  if (!email) notFound();

  const when = new Date(email.sentAt ?? email.scheduledAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const initial = (email.senderEmail[0] ?? "?").toUpperCase();

  return (
    <div className="min-h-screen bg-white p-5">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/sent" className="text-gray-800 hover:text-black" aria-label="Back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
              <path d="M19 12H5m0 0 6 6m-6-6 6-6" />
            </svg>
          </Link>
          <h1 className="truncate text-lg font-semibold text-gray-900">
            {email.subject}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-4 text-gray-700">
          <button aria-label="Star" className="hover:text-yellow-500">
            <StarIcon className="h-5 w-5" />
          </button>
          <button aria-label="Archive" className="hover:text-gray-900">
            <ArchiveIconWrapper />
          </button>
          <button aria-label="Delete" className="hover:text-red-600">
            <TrashIconWrapper />
          </button>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600">
            ME
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-[880px]">
        <div className="mb-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500 text-sm font-bold text-white">
              {initial}
            </span>
            <div>
              <p className="text-sm">
                <span className="font-bold text-gray-900">{email.senderEmail.split("@")[0]}</span>
                <span className="text-gray-400"> &lt;{email.senderEmail}&gt;</span>
              </p>
              <p className="flex items-center gap-1 text-xs text-gray-400">
                to me
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-400">{when}</p>
        </div>

        <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-900">
          {email.body}
        </div>
      </div>
    </div>
  );
}
