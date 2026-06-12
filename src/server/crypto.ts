import crypto from "node:crypto";
import fs from "node:fs";
import { getConfig } from "./config.js";

const algorithm = "aes-256-gcm";

export function getAppSecret(): Buffer {
  const config = getConfig();
  if (process.env.HAAI_SECRET) {
    return crypto.createHash("sha256").update(process.env.HAAI_SECRET).digest();
  }

  if (!fs.existsSync(config.secretPath)) {
    const secret = crypto.randomBytes(32).toString("base64url");
    fs.writeFileSync(config.secretPath, secret, { mode: 0o600 });
  }

  const secret = fs.readFileSync(config.secretPath, "utf8").trim();
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, getAppSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(value: string): string {
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Invalid encrypted secret format");
  }
  const decipher = crypto.createDecipheriv(
    algorithm,
    getAppSecret(),
    Buffer.from(ivRaw, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(12).toString("base64url")}`;
}

export function hmac(value: string): string {
  return crypto.createHmac("sha256", getAppSecret()).update(value).digest("base64url");
}
