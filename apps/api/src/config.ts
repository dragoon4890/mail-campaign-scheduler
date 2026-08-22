import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).default(4000),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type Config = z.infer<typeof envSchema>;

export const config: Config = envSchema.parse(process.env);
