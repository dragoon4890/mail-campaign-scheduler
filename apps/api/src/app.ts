import express, { type NextFunction, type Request, type Response } from "express";
import { healthRouter } from "./routes/health";
import { campaignsRouter } from "./routes/campaigns";

export function createApp(): express.Express {
  const app = express();

  app.use(express.json({ limit: "2mb" }));

  app.use("/healthz", healthRouter);
  app.use("/api/v1/campaigns", campaignsRouter);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError && "body" in err) {
      return res.status(400).json({ error: "malformed_json" });
    }
    console.error(err);
    return res.status(500).json({ error: "internal_error" });
  });

  return app;
}
