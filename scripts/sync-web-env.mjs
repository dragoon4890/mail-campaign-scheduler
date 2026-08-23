// Copies selected root .env keys into apps/web/.env.local so Next.js (which
// only reads env from apps/web) gets them at build, runtime and edge compile.
// Root .env stays the single source of truth.
import { readFileSync, writeFileSync } from "node:fs";

const ALLOWED = [
  "DATABASE_URL",
  "REDIS_URL",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_SECRET",
  "NEXT_PUBLIC_API_URL",
  "PORT",
  "MIN_DELAY_MS",
  "MAX_EMAILS_PER_HOUR",
  "MAX_EMAILS_PER_HOUR_PER_SENDER",
  "WORKER_CONCURRENCY",
  "SMTP_HOST",
  "SMTP_PORT",
];

const root = readFileSync(new URL("../.env", import.meta.url), "utf8");
const pairs = root
  .split(/\r?\n/)
  .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]);

const picked = pairs.filter(([k]) => ALLOWED.includes(k));
writeFileSync(
  new URL("../apps/web/.env.local", import.meta.url),
  picked.map(([k, v]) => `${k}=${v}`).join("\n") + "\n",
);
console.log(`synced ${picked.length} env keys -> apps/web/.env.local`);
