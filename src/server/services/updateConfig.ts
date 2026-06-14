import fs from "node:fs";
import path from "node:path";
import { getConfig } from "../config.js";
import { getUpdateSettings } from "../db/repositories.js";

export function updaterConfigPath(): string {
  return process.env.HAAI_UPDATE_CONFIG_PATH ?? path.join(getConfig().dataDir, "updater-config.json");
}

export function writeUpdaterConfig(): void {
  const settings = getUpdateSettings(true);
  const payload = {
    source: settings.source,
    githubOwner: settings.githubOwner,
    githubRepo: settings.githubRepo,
    githubToken: settings.githubToken ?? "",
    manifestUrl: settings.manifestUrl
  };

  fs.mkdirSync(path.dirname(updaterConfigPath()), { recursive: true });
  fs.writeFileSync(updaterConfigPath(), JSON.stringify(payload, null, 2), { mode: 0o640 });
}
