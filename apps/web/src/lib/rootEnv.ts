import fs from "node:fs";
import path from "node:path";

// Nodejs-only helper: loads the repo-root .env into process.env (first write
// wins nowhere — existing keys are never overwritten).
export function loadRootEnv(): void {
  const file = path.resolve(process.cwd(), "../../.env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.includes("=") || line.trim().startsWith("#")) continue;
    const key = line.slice(0, line.indexOf("=")).trim();
    if (!(key in process.env)) {
      process.env[key] = line.slice(line.indexOf("=") + 1).trim();
    }
  }
}
