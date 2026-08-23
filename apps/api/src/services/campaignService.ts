import { prisma } from "@assign/db";
import type {
  CampaignInput,
  CampaignScheduleResponse,
} from "@assign/shared";
import { getDevUserId } from "./devUser";

export class NoSendersError extends Error {
  constructor() {
    super("no active senders are configured");
    this.name = "NoSendersError";
  }
}

export async function scheduleCampaign(
  input: CampaignInput,
): Promise<CampaignScheduleResponse> {
  const senders = await prisma.sender.findMany({
    where: { active: true },
    orderBy: { id: "asc" },
    select: { id: true },
  });

  if (senders.length === 0) {
    throw new NoSendersError();
  }

  const uniqueLeads = [...new Set(input.leads)];
  const userId = await getDevUserId();
  const startAt = new Date(input.startAt);

  // Nested create runs as a single atomic transaction in Prisma:
  // campaign + all its email rows commit together or not at all.
  const campaign = await prisma.campaign.create({
    data: {
      userId,
      subject: input.subject,
      body: input.body,
      startAt,
      delayMs: input.delayMs,
      hourlyLimit: input.hourlyLimit,
      totalCount: uniqueLeads.length,
      emails: {
        create: uniqueLeads.map((toEmail, index) => ({
          senderId: senders[index % senders.length]!.id,
          toEmail,
          subject: input.subject,
          body: input.body,
          status: "PENDING",
          scheduledAt: startAt,
        })),
      },
    },
    select: { id: true },
  });

  return {
    id: campaign.id,
    totalLeads: input.leads.length,
    uniqueLeads: uniqueLeads.length,
    duplicatesRemoved: input.leads.length - uniqueLeads.length,
    startAt: input.startAt,
  };
}
