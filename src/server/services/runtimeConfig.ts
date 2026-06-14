import fs from "node:fs";
import path from "node:path";
import { getConfig } from "../config.js";
import { getRuntimeSettings } from "../db/repositories.js";

export interface RuntimeConfigFile {
  httpPort: number;
  httpsPort: number;
  httpsEnabled: boolean;
  certPath: string;
  keyPath: string;
}

export function runtimeConfigPath(): string {
  return process.env.HAAI_RUNTIME_CONFIG_PATH ?? path.join(getConfig().dataDir, "runtime-config.json");
}

export function certificateDirectory(hostname?: string): string {
  const name = hostname?.trim().toLowerCase() || "default";
  return path.join(getConfig().dataDir, "certs", name);
}

export function certificatePaths(hostname?: string): { certPath: string; keyPath: string } {
  const certDir = certificateDirectory(hostname);
  return {
    certPath: path.join(certDir, "cert.pem"),
    keyPath: path.join(certDir, "key.pem")
  };
}

export function writeRuntimeConfig(): RuntimeConfigFile {
  const settings = getRuntimeSettings(false);
  const paths = certificatePaths(settings.ssl.hostname);
  const payload: RuntimeConfigFile = {
    httpPort: settings.httpPort,
    httpsPort: settings.httpsPort,
    httpsEnabled: settings.httpsEnabled,
    certPath: paths.certPath,
    keyPath: paths.keyPath
  };

  fs.mkdirSync(path.dirname(runtimeConfigPath()), { recursive: true });
  fs.writeFileSync(runtimeConfigPath(), JSON.stringify(payload, null, 2), { mode: 0o640 });
  return payload;
}
