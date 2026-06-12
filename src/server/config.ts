import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface RuntimeConfig {
  host: string;
  port: number;
  dataDir: string;
  databasePath: string;
  secretPath: string;
  version: string;
}

export function getConfig(): RuntimeConfig {
  const dataDir =
    process.env.HAAI_DATA_DIR ?? path.join(os.homedir(), ".local", "share", "haai");

  fs.mkdirSync(dataDir, { recursive: true });

  return {
    host: process.env.HAAI_HOST ?? "0.0.0.0",
    port: Number(process.env.HAAI_PORT ?? 8787),
    dataDir,
    databasePath: process.env.HAAI_DB_PATH ?? path.join(dataDir, "haai.sqlite"),
    secretPath: process.env.HAAI_SECRET_PATH ?? path.join(dataDir, "app-secret"),
    version: process.env.npm_package_version ?? "0.0.1"
  };
}
