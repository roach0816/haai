import * as acme from "acme-client";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getRuntimeSettings, saveCertificateResult } from "../db/repositories.js";
import { certificateDirectory, certificatePaths, writeRuntimeConfig } from "./runtimeConfig.js";

interface CloudflareZone {
  id: string;
  name: string;
}

interface CloudflareRecord {
  id: string;
}

interface CloudflareResponse<T> {
  success: boolean;
  result: T;
  errors?: Array<{ code?: number; message?: string }>;
}

export async function requestLetsEncryptCertificate() {
  const settings = getRuntimeSettings(true);
  const hostname = settings.ssl.hostname.trim().toLowerCase();
  const cloudflareToken = settings.cloudflareToken?.trim() ?? "";
  if (!hostname) throw new Error("SSL hostname is required");
  if (settings.ssl.dnsProvider !== "cloudflare") throw new Error("Only Cloudflare DNS is supported");
  if (!cloudflareToken) throw new Error("Cloudflare token is required");

  saveCertificateResult({ status: "requesting" });

  try {
    const certDir = certificateDirectory(hostname);
    const paths = certificatePaths(hostname);
    fs.mkdirSync(certDir, { recursive: true, mode: 0o750 });

    const accountKeyPath = path.join(certDir, "account-key.pem");
    const accountKey = fs.existsSync(accountKeyPath)
      ? fs.readFileSync(accountKeyPath)
      : await acme.crypto.createPrivateKey();
    if (!fs.existsSync(accountKeyPath)) {
      fs.writeFileSync(accountKeyPath, accountKey, { mode: 0o600 });
    }

    const [certificateKey, csr] = await acme.crypto.createCsr({
      commonName: hostname,
      altNames: [hostname]
    });

    const client = new acme.Client({
      directoryUrl: acme.directory.letsencrypt.production,
      accountKey
    });

    const createdRecords: Array<{ zoneId: string; recordId: string }> = [];
    const certificate = await client.auto({
      csr,
      termsOfServiceAgreed: true,
      challengePriority: ["dns-01"],
      challengeCreateFn: async (authz, _challenge, keyAuthorization) => {
        const recordName = `_acme-challenge.${authz.identifier.value}`;
        const recordValue = dnsChallengeValue(keyAuthorization);
        const zone = await findCloudflareZone(hostname, cloudflareToken);
        const record = await createTxtRecord(zone.id, recordName, recordValue, cloudflareToken);
        createdRecords.push({ zoneId: zone.id, recordId: record.id });
        await waitForDnsPropagation();
      },
      challengeRemoveFn: async () => {
        await Promise.allSettled(
          createdRecords.map((record) =>
            deleteTxtRecord(record.zoneId, record.recordId, cloudflareToken)
          )
        );
      }
    });

    fs.writeFileSync(paths.keyPath, certificateKey, { mode: 0o600 });
    fs.writeFileSync(paths.certPath, certificate, { mode: 0o600 });
    writeRuntimeConfig();

    const info = acme.crypto.readCertificateInfo(certificate);
    return saveCertificateResult({
      status: "ready",
      issuedAt: info.notBefore.toISOString(),
      expiresAt: info.notAfter.toISOString()
    });
  } catch (error) {
    return saveCertificateResult({
      status: "failed",
      error: error instanceof Error ? error.message : "Certificate request failed"
    });
  }
}

async function findCloudflareZone(hostname: string, token: string): Promise<CloudflareZone> {
  const parts = hostname.split(".");
  for (let index = 0; index <= parts.length - 2; index += 1) {
    const zoneName = parts.slice(index).join(".");
    const response = await cloudflare<CloudflareZone[]>(
      `/zones?name=${encodeURIComponent(zoneName)}`,
      token
    );
    if (response.length > 0) return response[0];
  }
  throw new Error(`No Cloudflare zone found for ${hostname}`);
}

async function createTxtRecord(
  zoneId: string,
  name: string,
  content: string,
  token: string
): Promise<CloudflareRecord> {
  return cloudflare<CloudflareRecord>(`/zones/${zoneId}/dns_records`, token, {
    method: "POST",
    body: JSON.stringify({
      type: "TXT",
      name,
      content,
      ttl: 120
    })
  });
}

async function deleteTxtRecord(zoneId: string, recordId: string, token: string): Promise<void> {
  await cloudflare(`/zones/${zoneId}/dns_records/${recordId}`, token, { method: "DELETE" });
}

async function cloudflare<T>(
  pathName: string,
  token: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`https://api.cloudflare.com/client/v4${pathName}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const body = (await response.json().catch(() => ({}))) as Partial<CloudflareResponse<T>>;
  if (!response.ok || !body.success) {
    const detail = body.errors
      ?.map((item) => [item.code ? `code ${item.code}` : "", item.message].filter(Boolean).join(": "))
      .filter(Boolean)
      .join("; ");
    const hint =
      response.status === 401 || response.status === 403
        ? " Check that the Cloudflare API token is current and has Zone:Read plus DNS:Edit for the hostname's zone."
        : "";
    throw new Error(
      `Cloudflare request failed with HTTP ${response.status}${detail ? ` (${detail})` : ""}.${hint}`
    );
  }
  return body.result as T;
}

async function waitForDnsPropagation(): Promise<void> {
  const seconds = Number(process.env.HAAI_DNS_PROPAGATION_SECONDS ?? 60);
  await new Promise((resolve) => setTimeout(resolve, Math.max(1, seconds) * 1000));
}

function dnsChallengeValue(keyAuthorization: string): string {
  return crypto.createHash("sha256").update(keyAuthorization).digest("base64url");
}
