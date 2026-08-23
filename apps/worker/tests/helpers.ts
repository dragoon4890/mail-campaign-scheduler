import { prisma } from "@assign/db";
import Redis from "ioredis";
import type { SendEmailJobData } from "@assign/shared";
import type { Job } from "bullmq";
import type {
  EmailSender,
  SendEmailRequest,
} from "../src/services/EmailSender";

export interface SeededEmail {
  emailId: string;
  senderId: number;
}

export async function seedEmail(
  status: "QUEUED" | "SENDING",
  attempts = 0,
): Promise<SeededEmail> {
  const sender = await prisma.sender.create({
    data: {
      email: "s@ethereal.email",
      smtpUser: "s@ethereal.email",
      smtpPass: "pass",
    },
  });
  const user = await prisma.user.create({
    data: {
      googleSub: `sub-${crypto.randomUUID()}`,
      email: `${crypto.randomUUID()}@local`,
      name: "Test User",
    },
  });
  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id,
      subject: "test subject",
      body: "test body",
      startAt: new Date(),
      delayMs: 0,
      hourlyLimit: 100,
      totalCount: 1,
    },
  });
  const email = await prisma.email.create({
    data: {
      campaignId: campaign.id,
      senderId: sender.id,
      toEmail: "recipient@example.com",
      subject: "test subject",
      body: "test body",
      status,
      attempts,
      scheduledAt: new Date(),
    },
  });
  return { emailId: email.id, senderId: sender.id };
}

export function fakeJob(emailId: string): Job<SendEmailJobData> {
  return {
    data: { emailId },
    opts: { attempts: 3 },
    id: crypto.randomUUID(),
  } as unknown as Job<SendEmailJobData>;
}

export function countingSender(): {
  calls: SendEmailRequest[];
  emailSender: EmailSender;
} {
  const calls: SendEmailRequest[] = [];
  return {
    calls,
    emailSender: {
      async send(request) {
        calls.push(request);
        return { messageId: `mid-${calls.length}` };
      },
    },
  };
}

export async function truncateAll(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "emails", "campaigns", "senders", "users" RESTART IDENTITY CASCADE',
  );
}

// Tests run against a dedicated redis logical db, so flushing is safe.
export async function resetRedis(): Promise<void> {
  const redis = new Redis(process.env.REDIS_URL!);
  try {
    await redis.flushdb();
  } finally {
    redis.disconnect();
  }
}
