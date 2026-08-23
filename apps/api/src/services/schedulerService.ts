import { prisma } from "@assign/db";
import {
  EMAIL_SEND_JOB_PREFIX,
  type SendEmailJobData,
} from "@assign/shared";
import { emailSendQueue } from "../queue";

// Turns persisted PENDING rows into durable delayed jobs, then flips them to
// QUEUED (state truth: QUEUED means the job exists in Redis).
export async function enqueueCampaign(campaignId: string): Promise<number> {
  const emails = await prisma.email.findMany({
    where: { campaignId, status: "PENDING" },
    select: { id: true, scheduledAt: true },
  });

  await Promise.all(
    emails.map((email) => {
      const delay = Math.max(0, email.scheduledAt.getTime() - Date.now());
      return emailSendQueue.add(
        "send",
        { emailId: email.id } satisfies SendEmailJobData,
        { jobId: `${EMAIL_SEND_JOB_PREFIX}${email.id}`, delay },
      );
    }),
  );

  const updated = await prisma.email.updateMany({
    where: { campaignId, status: "PENDING" },
    data: { status: "QUEUED" },
  });

  return updated.count;
}
