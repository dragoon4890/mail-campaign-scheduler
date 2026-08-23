import { loadRootEnv } from "./loadRootEnv";
import { ensureTestDatabase } from "./testDb";

// Runs before anything else: derives the isolated test url from DATABASE_URL,
// creates the database + applies migrations when missing.
export default async function globalSetup(): Promise<void> {
  loadRootEnv();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL missing — copy .env.example to .env");
  }
  await ensureTestDatabase(process.env.DATABASE_URL);
}
