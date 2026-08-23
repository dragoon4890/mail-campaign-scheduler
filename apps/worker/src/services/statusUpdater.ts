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
