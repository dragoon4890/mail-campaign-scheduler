"use client";

import { useRef } from "react";

interface ToolButton {
  cmd: string;
  arg?: string;
  label: React.ReactNode;
  title: string;
}

const TOOLS: ToolButton[] = [
  { cmd: "undo", label: "↺", title: "Undo" },
  { cmd: "redo", label: "↻", title: "Redo" },
  { cmd: "bold", label: <b>B</b>, title: "Bold" },
  { cmd: "italic", label: <i>I</i>, title: "Italic" },
  { cmd: "underline", label: <u>U</u>, title: "Underline" },
  { cmd: "justifyLeft", label: "⯇", title: "Align left" },
  { cmd: "justifyCenter", label: "≡", title: "Align center" },
  { cmd: "insertUnorderedList", label: "• ☰", title: "Bulleted list" },
  { cmd: "insertOrderedList", label: "1. ☰", title: "Numbered list" },
  { cmd: "indent", label: "»", title: "Indent" },
  { cmd: "outdent", label: "«", title: "Outdent" },
  { cmd: "strikeThrough", label: <s>S</s>, title: "Strikethrough" },
];

// Rich-text toolbar over a contentEditable sibling (document.execCommand).
export function EditorToolbar({ targetId }: { targetId: string }) {
  const ref = useRef<HTMLDivElement>(null);

  function run(cmd: string, arg?: string) {
    document.getElementById(targetId)?.focus();
    document.execCommand(cmd, false, arg);
  }

  return (
    <div
      ref={ref}
      className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-2 py-1.5 shadow-sm"
    >
      {TOOLS.map((t) => (
        <button
          key={t.cmd}
          title={t.title}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run(t.cmd, t.arg)}
          className="flex h-7 min-w-7 items-center justify-center rounded px-1 text-sm text-gray-600 hover:bg-gray-100"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
