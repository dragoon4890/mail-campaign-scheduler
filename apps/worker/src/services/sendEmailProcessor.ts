import { DelayedError, type Job } from "bullmq";
import {
  INTERRUPTED,
  type SendEmailJobData,
} from "@assign/shared";
import { reserveSendSlot } from "./rateLimiter";
import { statusUpdater } from "./statusUpdater";
import type { EmailSender } from "./EmailSender";

export interface ProcessorDeps {
  emailSender: EmailSender;
}

function attemptsLimit(job: Job<SendEmailJobData>): number {
  return job.opts.attempts ?? 1;
}

// Orchestrates ONE job. All state mutation is delegated to statusUpdater's
// guarded transitions; all SMTP I/O to the injected EmailSender; all
// throttling to the rate limiter. Safety model: at-most-once (DESIGN.md §8.2).
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

  const reservation = await reserveSendSlot({
    senderId: email.senderId,
    campaignHourlyLimit: email.campaign.hourlyLimit,
  });
  if (!reservation.granted) {
    // Hourly cap hit: back the claim out (denials must not burn attempts)
    // and park the job at the top of the next window — never dropped.
    await statusUpdater.revertToQueued(email.id);
    await job.moveToDelayed(reservation.retryAtMs!, job.token);
    console.log(
      `job ${job.id}: hourly cap reached, rescheduled for ${new Date(reservation.retryAtMs!).toISOString()}`,
    );
    // BullMQ contract: after a manual moveToDelayed the processor must throw
    // DelayedError so the worker skips its own completion step. Returning
    // normally makes BullMQ double-move and log missing-lock stack traces.
    throw new DelayedError();
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
    // Confirmed rejection (429, bad recipient, connection refused...): the
    // server never accepted the message. Stop for this mailbox — FAILED is
    // terminal. No send-retries anywhere: at-most-once stays structural.
    const message = error instanceof Error ? error.message : String(error);
    await statusUpdater.markFailed(email.id, message);
    console.error(`job ${job.id}: FAILED permanently: ${message}`);
  }
}

