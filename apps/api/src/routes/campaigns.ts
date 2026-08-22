import { randomUUID } from "node:crypto";
import { Router } from "express";
import {
  campaignInputSchema,
  type CampaignScheduleResponse,
} from "@assign/shared";

export const campaignsRouter = Router();

campaignsRouter.post("/", (req, res) => {
  const parsed = campaignInputSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid_request",
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const input = parsed.data;
  const uniqueLeads = [...new Set(input.leads)];

  const response: CampaignScheduleResponse = {
    id: randomUUID(),
    totalLeads: input.leads.length,
    uniqueLeads: uniqueLeads.length,
    duplicatesRemoved: input.leads.length - uniqueLeads.length,
    startAt: input.startAt,
  };

  return res.status(201).json(response);
});
