import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "@assign/db";
import { config } from "../config";
import type {
  EmailSender,
  SendEmailRequest,
} from "./EmailSender";

// Production EmailSender: one authenticated transport per sender mailbox,
// created lazily and pooled for reuse across jobs.
class NodemailerSender implements EmailSender {
  private pool = new Map<number, Transporter>();

  private async transporterFor(senderId: number): Promise<Transporter> {
    const existing = this.pool.get(senderId);
    if (existing) return existing;

    const sender = await prisma.sender.findUniqueOrThrow({
      where: { id: senderId },
    });

    const transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: { user: sender.smtpUser, pass: sender.smtpPass },
    });

    this.pool.set(senderId, transporter);
    return transporter;
  }

  async send(request: SendEmailRequest): Promise<{ messageId: string }> {
    const transporter = await this.transporterFor(request.senderId);
    const info = await transporter.sendMail({
      from: request.from,
      to: request.to,
      subject: request.subject,
      text: request.body,
    });
    return { messageId: info.messageId };
  }
}

export const emailSender: EmailSender = new NodemailerSender();
