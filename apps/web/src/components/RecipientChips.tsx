"use client";

import { useRef, useState } from "react";
import { parseLeadsCsv } from "@/lib/csv";

// Recipient chip input with Upload List; shows first 3 chips + "+N" overflow
// exactly like the design.
export function RecipientChips({
  emails,
  onChange,
}: {
  emails: string[];
  onChange: (emails: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function add(raw: string) {
    const value = raw.trim().toLowerCase();
    if (!value || !value.includes("@")) return;
    if (!emails.includes(value)) onChange([...emails, value]);
    setDraft("");
  }

  function onFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { emails: parsed } = parseLeadsCsv(String(reader.result ?? ""));
      const merged = [...emails];
      for (const e of parsed) if (!merged.includes(e)) merged.push(e);
      onChange(merged);
    };
    reader.readAsText(file);
  }

  const visible = emails.slice(0, 3);
  const overflow = emails.length - visible.length;

  return (
    <div className="flex flex-1 flex-wrap items-center gap-1.5">
      {visible.map((email) => (
        <span
          key={email}
          className="flex items-center gap-1 rounded-full border border-green-600 px-2.5 py-0.5 text-xs text-gray-800"
        >
          {email}
          <button
            onClick={() => onChange(emails.filter((e) => e !== email))}
            className="text-gray-400 hover:text-gray-700"
            aria-label={`remove ${email}`}
          >
            ✕
          </button>
        </span>
      ))}
      {overflow > 0 && (
        <button
          onClick={() => fileRef.current?.click()}
          className="rounded-full border border-green-600 px-2.5 py-0.5 text-xs font-medium text-green-700"
          title="uploaded list — click to re-open file picker"
        >
          +{overflow}
        </button>
      )}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          }
          if (e.key === "Backspace" && !draft && emails.length) {
            onChange(emails.slice(0, -1));
          }
        }}
        onBlur={() => add(draft)}
        placeholder={emails.length === 0 ? "recipient@example.com" : ""}
        className="min-w-[180px] flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
      />
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

export function UploadListLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-green-600 hover:text-green-700"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
        <path d="M12 16V4m0 0 4 4m-4-4L8 8" />
        <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
      </svg>
      Upload List
    </button>
  );
}
