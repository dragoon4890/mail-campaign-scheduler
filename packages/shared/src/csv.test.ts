import { describe, expect, it } from "vitest";
import { parseLeadsCsv } from "./csv";

describe("parseLeadsCsv", () => {
  it("extracts emails from raw CSV rows (header counts as invalid)", () => {
    const result = parseLeadsCsv("name,email\nAsha,asha@acme.test\nRohit,rohit@lumen.test");
    expect(result.emails).toEqual(["asha@acme.test", "rohit@lumen.test"]);
    expect(result.invalidLines).toBe(1);
  });

  it("normalises case and surrounding whitespace", () => {
    const result = parseLeadsCsv("  Asha@Acme.COM ,  ");
    expect(result.emails).toEqual(["asha@acme.com"]);
  });

  it("dedupes repeated addresses", () => {
    const result = parseLeadsCsv("a@b.test,a@b.test,A@B.test");
    expect(result.emails).toEqual(["a@b.test"]);
  });

  it("counts non-email lines as invalid", () => {
    const result = parseLeadsCsv("not-an-email\na@b.test\nc@d.test");
    expect(result.emails).toEqual(["a@b.test", "c@d.test"]);
    expect(result.invalidLines).toBe(1);
  });

  it("returns empty rather than throwing on garbage input", () => {
    const result = parseLeadsCsv("@@@ ### ???");
    expect(result.emails).toEqual([]);
    expect(result.invalidLines).toBeGreaterThanOrEqual(0);
  });

  it("handles CRLF line endings", () => {
    const result = parseLeadsCsv("x@a.test\r\ny@b.test\r\n");
    expect(result.emails).toEqual(["x@a.test", "y@b.test"]);
  });
});
