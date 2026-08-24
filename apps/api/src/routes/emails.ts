import { prisma } from "@assign/db";
import { Router } from "express";

export const emailsRouter = Router();

const SCHEDULED = ["PENDING", "QUEUED", "SENDING"] as const;
const FINISHED = ["SENT", "FAILED"] as const;

const ROW_SELECT = {
  id: true,
  toEmail: true,
  subject: true,
  body: true,
  status: true,
  scheduledAt: true,
  sentAt: true,
} as const;

emailsRouter.get("/", async (req, res, next) => {
  try {
    const status = String(req.query.status ?? "scheduled");
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);

    const where =
      status === "sent"
        ? { status: { in: [...FINISHED] } }
        : status === "failed"
          ? { status: "FAILED" as const }
          : { status: { in: [...SCHEDULED] } };


    const rows = await prisma.email.findMany({
      where,
      select: ROW_SELECT,
      orderBy:
        status === "sent" || status === "failed"
          ? { sentAt: "desc" }
          : { scheduledAt: "asc" },
      take: limit,
    });

    res.json({
      status,
      count: rows.length,
      emails: rows.map((r) => ({ ...r, preview: r.body.slice(0, 90) })),
    });
  } catch (error) {
    next(error);
  }
});

emailsRouter.get("/stats", async (_req, res, next) => {
  try {
    const [scheduled, sent, failed] = await Promise.all([
      prisma.email.count({ where: { status: { in: [...SCHEDULED] } } }),
      prisma.email.count({ where: { status: "SENT" } }),
      prisma.email.count({ where: { status: "FAILED" } }),
    ]);
    res.json({ scheduled, sent, failed });
  } catch (error) {
    next(error);
  }
});

emailsRouter.get("/:id", async (req, res, next) => {
  try {
    const row = await prisma.email.findUnique({
      where: { id: req.params.id },
      select: { ...ROW_SELECT, sender: { select: { email: true } } },
    });
    if (!row) return res.status(404).json({ error: "not_found" });
    const { sender, ...rest } = row;
    res.json({ ...rest, senderEmail: sender.email });
  } catch (error) {
    next(error);
  }
});
