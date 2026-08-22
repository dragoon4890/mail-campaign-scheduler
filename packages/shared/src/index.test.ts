import { describe, expect, it } from "vitest";
import {
  MAX_LEADS_PER_CAMPAIGN,
  campaignInputSchema,
} from "./index";

const validInput = {
  subject: "  Launch announcement  ",
  body: "Hello world",
  leads: [" A@B.com ", "c@d.com"],
  startAt: "2026-08-24T10:00:00.000Z",
  delayMs: 2000,
  hourlyLimit: 50,
};

describe("campaignInputSchema", () => {
  it("accepts a valid payload and normalizes values", () => {
    const result = campaignInputSchema.safeParse(validInput);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.subject).toBe("Launch announcement");
    expect(result.data.body).toBe("Hello world");
    expect(result.data.leads).toEqual(["a@b.com", "c@d.com"]);
  });

  it("rejects an empty subject", () => {
    const result = campaignInputSchema.safeParse({ ...validInput, subject: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a whitespace-only body", () => {
    const result = campaignInputSchema.safeParse({ ...validInput, body: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email address", () => {
    const result = campaignInputSchema.safeParse({
      ...validInput,
      leads: ["not-an-email"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty leads array", () => {
    const result = campaignInputSchema.safeParse({ ...validInput, leads: [] });
    expect(result.success).toBe(false);
  });

  it("rejects more than MAX_LEADS_PER_CAMPAIGN leads", () => {
    const tooMany = Array.from(
      { length: MAX_LEADS_PER_CAMPAIGN + 1 },
      (_, i) => `user${i}@example.com`,
    );
    const result = campaignInputSchema.safeParse({ ...validInput, leads: tooMany });
    expect(result.success).toBe(false);
  });

  it("accepts duplicate leads (dedupe is the API layer's job)", () => {
    const result = campaignInputSchema.safeParse({
      ...validInput,
      leads: ["a@b.com", "a@b.com"],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.leads).toEqual(["a@b.com", "a@b.com"]);
  });

  it("accepts ISO datetimes with Z or numeric offset", () => {
    for (const startAt of [
      "2026-08-24T10:00:00Z",
      "2026-08-24T15:30:00+05:30",
    ]) {
      const result = campaignInputSchema.safeParse({ ...validInput, startAt });
      expect(result.success).toBe(true);
    }
  });

  it("rejects a datetime without a timezone designator", () => {
    const result = campaignInputSchema.safeParse({
      ...validInput,
      startAt: "2026-08-24T10:00:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-ISO datetime", () => {
    const result = campaignInputSchema.safeParse({
      ...validInput,
      startAt: "tomorrow morning",
    });
    expect(result.success).toBe(false);
  });

  it("accepts delayMs of 0 and rejects negatives, non-integers, and strings", () => {
    expect(
      campaignInputSchema.safeParse({ ...validInput, delayMs: 0 }).success,
    ).toBe(true);
    expect(
      campaignInputSchema.safeParse({ ...validInput, delayMs: -1 }).success,
    ).toBe(false);
    expect(
      campaignInputSchema.safeParse({ ...validInput, delayMs: 1.5 }).success,
    ).toBe(false);
    expect(
      campaignInputSchema.safeParse({ ...validInput, delayMs: "2000" }).success,
    ).toBe(false);
  });

  it("rejects hourlyLimit below 1 or above the ceiling", () => {
    expect(
      campaignInputSchema.safeParse({ ...validInput, hourlyLimit: 0 }).success,
    ).toBe(false);
    expect(
      campaignInputSchema.safeParse({ ...validInput, hourlyLimit: 100_001 })
        .success,
    ).toBe(false);
  });

  it("strips unknown keys", () => {
    const result = campaignInputSchema.safeParse({
      ...validInput,
      isAdmin: true,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect("isAdmin" in result.data).toBe(false);
  });

  it("reports issues with field paths for invalid payloads", () => {
    const result = campaignInputSchema.safeParse({
      ...validInput,
      subject: "",
      leads: ["bad"],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const paths = result.error.issues.map((issue) => issue.path.join("."));
    expect(paths).toContain("subject");
    expect(paths).toContain("leads.0");
  });
});
