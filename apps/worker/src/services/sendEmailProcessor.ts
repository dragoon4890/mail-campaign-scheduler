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

// Distinguish infrastructure failures (sender-side: connection refused,
// timeout, DNS) from message failures (recipient-side: 429, bad address).
// Infrastructure failures are reroutable — the email is fine, just routed
// to a dead mailbox. Message failures are terminal — retrying the same
// recipient through another sender would be a duplicate risk.
function isInfrastructureError(error: unknown): boolean {
  const code = (error as any)?.code as string | undefined;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "ECONNRESET" ||
    code === "EAI_AGAIN" ||
    /connection refused/i.test(msg) ||
    /timed? ?out/i.test(msg) ||
    /name resolution/i.test(msg)
  );
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
    // Infrastructure failure (connection refused, timeout, DNS) → the sender is
    // dead, not the email. Reroute to a healthy sender if one exists; else fail.
    if (isInfrastructureError(error)) {
      const nextSender = await statusUpdater.findNextHealthySenderId(email.senderId);
      if (nextSender) {
        await statusUpdater.reassignAndRevert(email.id, nextSender);
        console.warn(`job ${job.id}: sender ${email.senderId} down, rerouted to ${nextSender}`);
        return; // requeued; next attempt picks up with new sender
      }
    }
    // Message failure (429, bad recipient, etc.) or no healthy sender left → terminal.
    const message = error instanceof Error ? error.message : String(error);
    await statusUpdater.markFailed(email.id, message);
    console.error(`job ${job.id}: FAILED permanently: ${message}`);
  }
}

