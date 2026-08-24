const EMAIL_RE = /[^,\s;]+@[^,\s;]+\.[^,\s;]+/g;

export interface CsvParseResult {
  emails: string[];
  invalidLines: number;
}

// Pure CSV/TXT lead parser: extracts, normalises, dedupes. No I/O — the
// browser reads file text, the server re-validates every address anyway.
export function parseLeadsCsv(text: string): CsvParseResult {
  const found = text.match(EMAIL_RE) ?? [];
  const emails = [...new Set(found.map((e) => e.trim().toLowerCase()))];
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  return { emails, invalidLines: Math.max(0, lines.length - emails.length) };
}
