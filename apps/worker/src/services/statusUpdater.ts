import { prisma } from "@assign/db";
import { INTERRUPTED } from "@assign/shared";

// Guarded transitions only — every mutation is conditional on current status,
// which is what makes duplicate sends structurally impossible.
export const statusUpdater = {
  /** QUEUED -> SENDING. Returns true iff THIS caller won the claim. */
  async claim(emailId: string): Promise<boolean> {
    const res = await prisma.email.updateMany({
      where: { id: emailId, status: "QUEUED" },
      data: { status: "SENDING", attempts: { increment: 1 } },
    });
    return res.count === 1;
  },

  async markSent(emailId: string, messageId: string): Promise<void> {
    await prisma.email.updateMany({
      where: { id: emailId, status: "SENDING" },
      data: { status: "SENT", sentAt: new Date(), messageId },
    });
  },

  async markFailed(emailId: string, lastError: string): Promise<void> {
    await prisma.email.updateMany({
      where: { id: emailId, status: "SENDING" },
      data: { status: "FAILED", lastError },
    });
  },

  /** Final-attempt crash recovery: SENDING -> FAILED(interrupted). Never re-sends. */
  async markInterruptedIfSending(emailId: string): Promise<boolean> {
    const res = await prisma.email.updateMany({
      where: { id: emailId, status: "SENDING" },
      data: { status: "FAILED", lastError: INTERRUPTED },
    });
    return res.count === 1;
  },

  /** Rate-limit denial: back out of the claim entirely — a denied slot must
   * not consume an attempt, and SENDING must never mean "waiting to retry". */
  async revertToQueued(emailId: string): Promise<void> {
    await prisma.email.updateMany({
      where: { id: emailId, status: "SENDING" },
      data: { status: "QUEUED", attempts: { decrement: 1 } },
    });
  },

  /** Infrastructure failure: reassign to a different sender and revert to QUEUED
   * so the next attempt picks up with the new sender. Does NOT decrement attempts
   * (a real send WAS attempted, unlike a rate-limit denial). */
  async reassignAndRevert(emailId: string, newSenderId: number): Promise<void> {
    await prisma.email.updateMany({
      where: { id: emailId, status: "SENDING" },
      data: { senderId: newSenderId, status: "QUEUED" },
    });
  },

  /** Find the next active sender that isn't the one that just failed. */
  async findNextHealthySenderId(excludeId: number): Promise<number | null> {
    const senders = await prisma.sender.findMany({
      where: { active: true, id: { not: excludeId } },
      select: { id: true },
      orderBy: { id: "asc" },
      take: 1,
    });
    return senders.length > 0 ? senders[0].id : null;
  },

  getWithSender(emailId: string) {
    return prisma.email.findUnique({
      where: { id: emailId },
      include: {
        sender: true,
        campaign: { select: { hourlyLimit: true } },
      },
    });
  },
};
