import { Router } from "express";
import { campaignInputSchema } from "@assign/shared";
import {
  NoSendersError,
  scheduleCampaign,
} from "../services/campaignService";
import { enqueueCampaign } from "../services/schedulerService";
import type { NextFunction, Request, Response } from "express";

export const campaignsRouter = Router();

campaignsRouter.post("/", (req: Request, res: Response, next: NextFunction) => {
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

  scheduleCampaign(parsed.data)
    .then(async (campaign) => {
      try {
        const queued = await enqueueCampaign(campaign.id);
        console.log(`queued ${queued} job(s) for campaign ${campaign.id}`);
      } catch (error) {
        // Persisted but not scheduled: truthful partial-failure response.
        console.error(`enqueue failed for campaign ${campaign.id}`, error);
        return res.status(503).json({
          error: "queue_unavailable",
          message: "campaign persisted but not scheduled",
          campaignId: campaign.id,
        });
      }
      return res.status(201).json(campaign);
    })
    .catch((error: unknown) => {
      if (error instanceof NoSendersError) {
        return res.status(503).json({
          error: "no_senders_configured",
          message: error.message,
        });
      }
      return next(error);
    });

  return undefined;
});
