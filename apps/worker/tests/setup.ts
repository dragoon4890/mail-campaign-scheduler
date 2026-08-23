import { loadRootEnv } from "./loadRootEnv";
import {
  ensureTestDatabase,
  deriveTestUrl,
} from "./testDb";

loadRootEnv();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL missing — copy .env.example to .env");
}

// Swap the database name (and redis logical db) so tests are structurally
// isolated from dev data no matter what DATABASE_URL points at.
export const testDatabaseUrl = await ensureTestDatabase(
  process.env.DATABASE_URL,
);
process.env.DATABASE_URL = testDatabaseUrl;
process.env.REDIS_URL = `${
  (process.env.REDIS_URL ?? "redis://localhost:6379").replace(/\/\d+(\?.*)?$/, "")
}/15`;
