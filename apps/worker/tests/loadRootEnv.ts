import path from "node:path";
import { config as loadEnv } from "dotenv";

// Loads the repo-root .env exactly once; safe to call from every vitest
// phase (dotenv skips keys already present in process.env).
export function loadRootEnv(): void {
  loadEnv({ path: path.resolve(process.cwd(), "../../.env") });
}
