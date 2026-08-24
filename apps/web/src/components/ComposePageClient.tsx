"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL, type Sender } from "@/lib/api";
import {
  EditorToolbar,
} from "@/components/EditorToolbar";
import {
  RecipientChips,
} from "@/components/RecipientChips";
import { SendLaterMenu } from "@/components/SendLaterMenu";

const EDITOR_ID = "compose-editor";

function BackArrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
      <path d="M19 12H5m0 0 6 6m-6-6 6-6" />
    </svg>
  );
}

function PaperclipIcon({ count }: { count: number }) {
  return (
    <span className="relative">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
        <path d="m21 12-8.5 8.5a5 5 0 0 1-7-7l8.8-8.8a3.5 3.5 0 1 1 5 5L10.5 18.5a2 2 0 1 1-3-3l8-8" />
      </svg>
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-green-600 text-[9px] font-bold text-white">
          {count}
        </span>
      )}
    </span>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function ComposePageClient({ senders }: { senders: Sender[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [scheduleAt, setScheduleAt] = useState<Date | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [delaySec, setDelaySec] = useState("");
  const [hourlyLimit, setHourlyLimit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function onFiles(files: FileList | null) {
    if (!files) return;
    setAttachments((prev) => [...prev, ...Array.from(files)]);
  }

  async function submit() {
    setError(null);
    if (recipients.length === 0 || !subject) {
      setError("at least one recipient and a subject are required");
      return;
    }
    setBusy(true);
    try {
      const editor = document.getElementById(EDITOR_ID);
      const body = (editor?.innerText ?? "").trim();
      if (!body) {
        setError("email body is empty");
        setBusy(false);
        return;
      }
      const res = await fetch(`${API_URL}/api/v1/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          body,
          leads: recipients,
          startAt: (scheduleAt ?? new Date()).toISOString(),
          delayMs: Number(delaySec || 0) * 1000,
          hourlyLimit: Number(hourlyLimit || 100000),
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.message ?? payload.error ?? `HTTP ${res.status}`);
      }
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "send failed");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-white p-5">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push("/")} className="text-gray-800 hover:text-black" aria-label="Back">
            <BackArrow />
          </button>
          <h1 className="text-xl font-semibold text-gray-900">Compose New Email</h1>
        </div>
        <div className="flex items-center gap-5">
          <button
            onClick={() => fileRef.current?.click()}
            className="text-gray-700 hover:text-gray-900"
            aria-label="Attach files"
          >
            <PaperclipIcon count={attachments.length} />
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="text-gray-700 hover:text-gray-900"
              aria-label="Send later"
            >
              <ClockIcon />
            </button>
            {menuOpen && (
              <SendLaterMenu
                onPick={(date) => {
                  setScheduleAt(date);
                  setMenuOpen(false);
                }}
                onClose={() => setMenuOpen(false)}
              />
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          {scheduleAt ? (
            <button
              onClick={submit}
              disabled={busy}
              className="flex h-9 items-center gap-2 rounded-full border border-green-600 px-5 text-sm font-medium text-green-600 hover:bg-green-50 disabled:opacity-50"
            >
              <ClockIcon />
              {busy ? "Scheduling..." : "Send Later"}
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={busy}
              className="h-9 rounded-full bg-green-600 px-6 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {busy ? "Sending..." : "Send"}
            </button>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-[950px]">
        <div className="flex items-center gap-4 border-b border-gray-200 py-3">
          <span className="w-[130px] shrink-0 text-sm text-gray-800">From</span>
          <select className="rounded-md bg-gray-100 px-3 py-1.5 text-sm text-gray-800 outline-none">
            {senders.map((s) => (
              <option key={s.id}>{s.email}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-4 border-b border-gray-200 py-3">
          <span className="w-[130px] shrink-0 text-sm text-gray-800">To</span>
          <RecipientChips emails={recipients} onChange={setRecipients} />
        </div>

        <div className="flex items-center gap-4 border-b border-gray-200 py-3">
          <span className="w-[130px] shrink-0 text-sm text-gray-800">Subject</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
        </div>

        <div className="flex items-center gap-4 py-3">
          <span className="w-[130px] shrink-0 whitespace-nowrap text-sm text-gray-800">
            Delay between 2 emails
          </span>
          <input
            value={delaySec}
            onChange={(e) => setDelaySec(e.target.value.replace(/\D/g, ""))}
            placeholder="00"
            className="h-8 w-16 rounded-md border border-gray-300 text-center text-sm outline-none focus:border-green-500"
          />
          <span className="-ml-2 text-sm text-gray-500">sec</span>
          <span className="ml-4 text-sm text-gray-800">Hourly Limit</span>
          <input
            value={hourlyLimit}
            onChange={(e) => setHourlyLimit(e.target.value.replace(/\D/g, ""))}
            placeholder="00"
            className="h-8 w-16 rounded-md border border-gray-300 text-center text-sm outline-none focus:border-green-500"
          />
        </div>

        <div className="relative rounded-lg bg-gray-50">
          <div
            id={EDITOR_ID}
            contentEditable
            suppressContentEditableWarning
            className="min-h-[420px] w-full rounded-lg px-5 pt-4 text-sm text-gray-900 outline-none [data-empty]:text-gray-400"
            data-placeholder="Type Your Reply..."
          />
          <style>{`#${EDITOR_ID}:empty::before{content:"Type Your Reply...";color:#9ca3af;pointer-events:none}`}</style>
          <div className="sticky bottom-4 flex justify-center">
            <div className="-mt-2">
              <EditorToolbar targetId={EDITOR_ID} />
            </div>
          </div>
        </div>

        {attachments.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {attachments.map((file, i) => (
              <div key={`${file.name}-${i}`} className="w-32 overflow-hidden rounded-lg border border-gray-200">
                {file.type.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={URL.createObjectURL(file)} alt={file.name} className="h-20 w-full object-cover" />
                ) : (
                  <div className="flex h-20 items-center justify-center bg-gray-100 text-xl">📄</div>
                )}
                <div className="p-1.5">
                  <p className="truncate text-xs text-gray-800">{file.name}</p>
                  <p className="text-[10px] text-gray-400">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
