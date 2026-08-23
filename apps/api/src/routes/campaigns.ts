import { Router } from "express";
import { campaignInputSchema } from "@assign/shared";
import {
  NoSendersError,
  scheduleCampaign,
} from "../services/campaignService";
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
    .then((response) => res.status(201).json(response))
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
