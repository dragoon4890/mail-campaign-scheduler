import type { Job } from "bullmq";
import {
  INTERRUPTED,
  type SendEmailJobData,
} from "@assign/shared";
import { statusUpdater } from "./statusUpdater";
import type { EmailSender } from "./EmailSender";

export interface ProcessorDeps {
  emailSender: EmailSender;
}

function attemptsLimit(job: Job<SendEmailJobData>): number {
  return job.opts.attempts ?? 1;
}

// Orchestrates ONE job. All state mutation is delegated to statusUpdater's
// guarded transitions; all SMTP I/O to the injected EmailSender.
// Safety model: at-most-once (see DESIGN.md §8.2).
export async function processSendEmail(
  job: Job<SendEmailJobData>,
  deps: ProcessorDeps,
): Promise<void> {
  const email = await statusUpdater.getWithSender(job.data.emailId);
  if (!email) {
    console.warn(`job ${job.id}: email row missing, acking`);
    return;
  }

  const claimed = await statusUpdater.claim(email.id);
  if (!claimed) {
    // Lost the claim: either a live owner is mid-send, or the row reached a
    // terminal state. On the FINAL attempt, a still-SENDING row means its
    // owner crashed inside the send window -> mark honestly, never re-send.
    if (
      email.status === "SENDING" &&
      email.attempts >= attemptsLimit(job)
    ) {
      await statusUpdater.markInterruptedIfSending(email.id);
      console.warn(`job ${job.id}: interrupted send marked FAILED (${INTERRUPTED})`);
    }
    return; // ack without sending
  }

  try {
    const { messageId } = await deps.emailSender.send({
      senderId: email.senderId,
      from: email.sender.email,
      to: email.toEmail,
      subject: email.subject,
      body: email.body,
    });
    await statusUpdater.markSent(email.id, messageId);
  } catch (error) {
    if (email.attempts >= attemptsLimit(job)) {
      const message = error instanceof Error ? error.message : String(error);
      await statusUpdater.markFailed(email.id, message);
      console.error(`job ${job.id}: FAILED permanently: ${message}`);
      return;
    }
    throw error; // BullMQ schedules the next attempt with backoff
  }
}
