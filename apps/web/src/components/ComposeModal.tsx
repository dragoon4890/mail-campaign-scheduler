"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseLeadsCsv } from "@/lib/csv";
import { API_URL } from "@/lib/api";

export function ComposeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [leads, setLeads] = useState<string[]>([]);
  const [startAt, setStartAt] = useState("");
  const [delaySec, setDelaySec] = useState("30");
  const [hourlyLimit, setHourlyLimit] = useState("50");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  function onFile(file: File | null) {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseLeadsCsv(String(reader.result ?? ""));
      setLeads(result.emails);
      setError(result.emails.length ? null : "no valid email addresses found in file");
    };
    reader.readAsText(file);
  }

  async function submit() {
    setError(null);
    if (!subject || !body || leads.length === 0 || !startAt) {
      setError("subject, body, leads file and start time are required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          body,
          leads,
          startAt: new Date(startAt).toISOString(),
          delayMs: Number(delaySec) * 1000,
          hourlyLimit: Number(hourlyLimit),
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.message ?? payload.error ?? `HTTP ${res.status}`);
      }
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "schedule failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-[520px] rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Compose new email</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            ✕
          </button>
        </div>

        <label className="mb-1 block text-sm text-gray-500">Leads (CSV / TXT)</label>
        <label className="mb-1 flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-500 hover:border-green-500">
          <span>{fileName ?? "choose a .csv / .txt file"}</span>
          {leads.length > 0 && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              {leads.length} addresses detected
            </span>
          )}
          <input
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <label className="mb-1 mt-4 block text-sm text-gray-500">Subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mb-3 h-10 w-full rounded-lg bg-gray-100 px-3 text-sm outline-none focus:ring-2 focus:ring-green-500"
          placeholder="Meeting follow-up"
        />

        <label className="mb-1 block text-sm text-gray-500">Body</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          className="mb-3 w-full resize-none rounded-lg bg-gray-100 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
          placeholder="Hi John, just wanted to follow up..."
        />

        <div className="mb-3 grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-sm text-gray-500">Start time</label>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="h-10 w-full rounded-lg bg-gray-100 px-3 text-sm outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-500">Delay (sec)</label>
            <input
              type="number"
              min={0}
              value={delaySec}
              onChange={(e) => setDelaySec(e.target.value)}
              className="h-10 w-full rounded-lg bg-gray-100 px-3 text-sm outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-500">Hourly limit</label>
            <input
              type="number"
              min={1}
              value={hourlyLimit}
              onChange={(e) => setHourlyLimit(e.target.value)}
              className="h-10 w-full rounded-lg bg-gray-100 px-3 text-sm outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        <button
          onClick={submit}
          disabled={busy}
          className="h-11 w-full rounded-lg bg-green-600 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {busy ? "Scheduling..." : "Schedule"}
        </button>
      </div>
    </div>
  );
}
