import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

// Works whether the process starts from repo root or from apps/worker.
for (const candidate of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env"),
]) {
  if (fs.existsSync(candidate)) {
    loadEnv({ path: candidate });
    break;
  }
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SMTP_HOST: z.string().min(1).default("smtp.ethereal.email"),
  SMTP_PORT: z.coerce.number().int().default(587),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
  MAX_EMAILS_PER_HOUR: z.coerce.number().int().min(1).default(200),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().min(1).default(50),
  MIN_DELAY_MS: z.coerce.number().int().min(0).default(2000),
});

export type Config = z.infer<typeof envSchema>;

export const config: Config = envSchema.parse(process.env);
