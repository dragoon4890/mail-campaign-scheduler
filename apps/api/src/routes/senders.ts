import { prisma } from "@assign/db";
import { Router } from "express";

export const sendersRouter = Router();

sendersRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.sender.findMany({
      where: { active: true },
      select: { id: true, email: true },
      orderBy: { id: "asc" },
    });
    res.json({ senders: rows });
  } catch (error) {
    next(error);
  }
});
