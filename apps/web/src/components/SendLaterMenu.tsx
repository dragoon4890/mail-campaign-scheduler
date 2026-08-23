"use client";

import { useState } from "react";

function preset(label: string, compute: () => Date) {
  return { label, compute };
}

const PRESETS = [
  preset("Tomorrow", () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }),
  preset("Tomorrow, 10:00 AM", () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d;
  }),
  preset("Tomorrow, 11:00 AM", () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(11, 0, 0, 0);
    return d;
  }),
  preset("Tomorrow, 3:00 PM", () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(15, 0, 0, 0);
    return d;
  }),
];

// "Send Later" dropdown: quick presets + custom date & time picker.
export function SendLaterMenu({
  onPick,
  onClose,
}: {
  onPick: (date: Date) => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState("");

  return (
    <div className="absolute right-0 top-11 z-50 w-[260px] rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
      <p className="mb-3 text-sm font-semibold text-gray-900">Send Later</p>

      <div className="mb-3 flex items-center justify-between border-b border-gray-200 pb-2">
        <input
          type="datetime-local"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          className="text-sm text-gray-500 outline-none"
        />
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-gray-400">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 10h18" />
        </svg>
      </div>

      <div className="flex flex-col">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => onPick(p.compute())}
            className="rounded-lg px-1 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-end gap-3">
        <button onClick={onClose} className="text-sm text-gray-700 hover:text-gray-900">
          Cancel
        </button>
        <button
          onClick={() => {
            if (custom) onPick(new Date(custom));
          }}
          className="rounded-full border border-green-600 px-4 py-1 text-sm font-medium text-green-600 hover:bg-green-50"
        >
          Done
        </button>
      </div>
    </div>
  );
}
