import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@assign/db";
import { INTERRUPTED } from "@assign/shared";
import { processSendEmail } from "../src/services/sendEmailProcessor";
import { reserveSendSlot } from "../src/services/rateLimiter";
import {
  countingSender,
  fakeJob,
  resetRedis,
  seedEmail,
  truncateAll,
} from "./helpers";

beforeEach(async () => {
  await truncateAll();
  await resetRedis();
});

describe("claim-guard: exactly-once sends", () => {
  it("case 1: two processors race the same QUEUED row -> exactly one SMTP call", async () => {
    const { emailId, senderId } = await seedEmail("QUEUED");
    const deps = countingSender();

    await Promise.all([
      processSendEmail(fakeJob(emailId), deps),
      processSendEmail(fakeJob(emailId), deps),
    ]);

    expect(deps.calls).toHaveLength(1);
    expect(deps.calls[0]!.senderId).toBe(senderId);
    const row = await prisma.email.findUniqueOrThrow({ where: { id: emailId } });
    expect(row.status).toBe("SENT");
    expect(row.attempts).toBe(1);
  });

  it("case 2: latecomer fires after completion -> acks without sending", async () => {
    const { emailId } = await seedEmail("QUEUED");
    const deps = countingSender();

    await processSendEmail(fakeJob(emailId), deps);
    await processSendEmail(fakeJob(emailId), deps);

    expect(deps.calls).toHaveLength(1);
  });

  it("case 3: final attempt finds SENDING row (crash window) -> FAILED(interrupted), no send", async () => {
    const { emailId } = await seedEmail("SENDING", /* attempts */ 3);
    const deps = countingSender();

    await processSendEmail(fakeJob(emailId), deps);

    expect(deps.calls).toHaveLength(0);
    const row = await prisma.email.findUniqueOrThrow({ where: { id: emailId } });
    expect(row.status).toBe("FAILED");
    expect(row.lastError).toBe(INTERRUPTED);
  });

  it("case 4: healthy walk QUEUED -> SENDING -> SENT records message id", async () => {
    const { emailId, senderId } = await seedEmail("QUEUED");
    const deps = countingSender();

    await processSendEmail(fakeJob(emailId), deps);

    expect(deps.calls).toHaveLength(1);
    expect(deps.calls[0]!.from).toBe("s@ethereal.email");
    const row = await prisma.email.findUniqueOrThrow({ where: { id: emailId } });
    expect(row.status).toBe("SENT");
    expect(row.sentAt).not.toBeNull();
    expect(row.messageId).toBe("mid-1");
  });

  it("case 5: redelivery of already-SENT job -> acks, zero SMTP calls", async () => {
    const { emailId } = await seedEmail("QUEUED");
    const deps = countingSender();

    await processSendEmail(fakeJob(emailId), deps);
    await processSendEmail(fakeJob(emailId), deps); // stalled-job redelivery

    expect(deps.calls).toHaveLength(1);
    const row = await prisma.email.findUniqueOrThrow({ where: { id: emailId } });
    expect(row.status).toBe("SENT");
  });
});

describe("rateLimiter: atomic slot reservation", () => {
  it("grants exactly the cap under parallel contention and denies the rest", async () => {
    // campaign cap of 5 lowers the lane threshold -> boundary sits at 5
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        reserveSendSlot({ senderId: 42, campaignHourlyLimit: 5 }),
      ),
    );

    expect(results.filter((r) => r.granted)).toHaveLength(5);
    expect(results.filter((r) => !r.granted)).toHaveLength(5);
    expect(results.every((r) => r.retryAtMs !== null || r.granted)).toBe(true);
  });

  it("lowers the lane threshold to campaign.hourly_limit when stricter", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        reserveSendSlot({ senderId: 43, campaignHourlyLimit: 3 }),
      ),
    );

    expect(results.filter((r) => r.granted)).toHaveLength(3);
  });
});
