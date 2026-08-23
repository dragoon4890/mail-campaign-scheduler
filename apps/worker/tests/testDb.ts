import { execSync } from "node:child_process";
import { PrismaClient } from "@assign/db";

export const TEST_DB_NAME = "email_scheduler_test";

export function deriveTestUrl(devUrl: string): string {
  const swapped = devUrl.replace(/\/([^/?]+)(\?.*)?$/, `/${TEST_DB_NAME}$2`);
  if (swapped === devUrl) {
    throw new Error("could not derive isolated test database url");
  }
  return swapped;
}

async function databaseExists(testUrl: string): Promise<boolean> {
  const probe = new PrismaClient({ datasources: { db: { url: testUrl } } });
  try {
    await probe.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.$disconnect();
  }
}

async function tablesExist(testUrl: string): Promise<boolean> {
  const probe = new PrismaClient({ datasources: { db: { url: testUrl } } });
  try {
    const rows = await probe.$queryRaw<{ exists: boolean }[]>`
      SELECT to_regclass('public.emails') IS NOT NULL AS exists`;
    return rows[0]!.exists;
  } finally {
    await probe.$disconnect();
  }
}

function createDatabase(): void {
  const container =
    process.env.TEST_POSTGRES_CONTAINER ?? "assign-postgres-1";
  execSync(
    `docker exec ${container} psql -U email -d postgres -c "CREATE DATABASE ${TEST_DB_NAME}"`,
    { stdio: "pipe" },
  );
}

function migrate(testUrl: string): void {
  execSync("pnpm --filter @assign/db exec prisma migrate deploy", {
    cwd: "../..",
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "inherit",
  });
}

// Idempotent: creates the isolated database and applies migrations only when
// actually missing. Never touches the dev database.
export async function ensureTestDatabase(devUrl: string): Promise<string> {
  const testUrl = deriveTestUrl(devUrl);
  if (!(await databaseExists(testUrl))) {
    createDatabase();
  }
  if (!(await tablesExist(testUrl))) {
    migrate(testUrl);
  }
  return testUrl;
}
