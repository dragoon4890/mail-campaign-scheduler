import { z } from "zod";

export const EMAIL_STATUSES = [
  "PENDING",
  "QUEUED",
  "SENDING",
  "SENT",
  "FAILED",
] as const;

export type EmailStatus = (typeof EMAIL_STATUSES)[number];

export const MAX_LEADS_PER_CAMPAIGN = 10_000;

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("invalid email address");

export const campaignInputSchema = z.object({
  subject: z.string().trim().min(1, "subject is required").max(998),
  body: z.string().trim().min(1, "body is required"),
  leads: z
    .array(emailSchema)
    .min(1, "at least one lead is required")
    .max(MAX_LEADS_PER_CAMPAIGN),
  startAt: z.string().datetime({ offset: true }),
  delayMs: z.number().int().min(0).max(3_600_000),
  hourlyLimit: z.number().int().min(1).max(100_000),
});

export type CampaignInput = z.infer<typeof campaignInputSchema>;

export interface CampaignScheduleResponse {
  id: string;
  totalLeads: number;
  uniqueLeads: number;
  duplicatesRemoved: number;
  startAt: string;
}

export const EMAIL_SEND_QUEUE = "email-send";
export const EMAIL_SEND_JOB_PREFIX = "send-";

export interface SendEmailJobData {
  emailId: string;
}

export const INTERRUPTED = "interrupted";
