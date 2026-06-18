import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface RuntimeConfig {
  host: string;
  port: number;
  protocol: "http" | "https";
  httpsEnabled: boolean;
  certPath: string;
  keyPath: string;
  dataDir: string;
  databasePath: string;
  secretPath: string;
  version: string;
}

export function getConfig(): RuntimeConfig {
  const dataDir =
    process.env.HAAI_DATA_DIR ?? path.join(os.homedir(), ".local", "share", "haai");

  fs.mkdirSync(dataDir, { recursive: true });

  const runtime = readRuntimeConfig(dataDir);
  const httpsReady = Boolean(
    runtime.httpsEnabled &&
    runtime.certPath &&
    runtime.keyPath &&
    fs.existsSync(runtime.certPath) &&
    fs.existsSync(runtime.keyPath)
  );
  const port =
    process.env.HAAI_PORT !== undefined
      ? Number(process.env.HAAI_PORT)
      : httpsReady
        ? runtime.httpsPort
        : runtime.httpPort;

  return {
    host: process.env.HAAI_HOST ?? "0.0.0.0",
    port,
    protocol: httpsReady ? "https" : "http",
    httpsEnabled: httpsReady,
    certPath: runtime.certPath,
    keyPath: runtime.keyPath,
    dataDir,
    databasePath: process.env.HAAI_DB_PATH ?? path.join(dataDir, "haai.sqlite"),
    secretPath: process.env.HAAI_SECRET_PATH ?? path.join(dataDir, "app-secret"),
    version: process.env.npm_package_version ?? readPackageVersion()
  };
}

export function readOptionalSecret(name: string): string | undefined {
  const fileName = `${name}_FILE`;
  const filePath = process.env[fileName];
  if (filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`${fileName} points to a missing file`);
    }
    return fs.readFileSync(filePath, "utf8").replace(/\r?\n$/, "");
  }
  return process.env[name];
}

function readRuntimeConfig(dataDir: string): {
  httpPort: number;
  httpsPort: number;
  httpsEnabled: boolean;
  certPath: string;
  keyPath: string;
} {
  const fallback = {
    httpPort: 8787,
    httpsPort: 443,
    httpsEnabled: false,
    certPath: path.join(dataDir, "certs", "default", "cert.pem"),
    keyPath: path.join(dataDir, "certs", "default", "key.pem")
  };
  const configPath = process.env.HAAI_RUNTIME_CONFIG_PATH ?? path.join(dataDir, "runtime-config.json");
  if (!fs.existsSync(configPath)) return fallback;

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as Partial<typeof fallback>;
    return {
      httpPort: normalizePort(parsed.httpPort, fallback.httpPort),
      httpsPort: normalizePort(parsed.httpsPort, fallback.httpsPort),
      httpsEnabled: Boolean(parsed.httpsEnabled),
      certPath: parsed.certPath || fallback.certPath,
      keyPath: parsed.keyPath || fallback.keyPath
    };
  } catch {
    return fallback;
  }
}

function normalizePort(value: unknown, fallback: number): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return fallback;
  return port;
}

function readPackageVersion(): string {
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { version?: string };
    return packageJson.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
