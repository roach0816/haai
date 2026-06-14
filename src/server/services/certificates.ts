import * as acme from "acme-client";
import dns from "node:dns/promises";
import fs from "node:fs";
import path from "node:path";
import { getRuntimeSettings, saveCertificateResult } from "../db/repositories.js";
import { certificateDirectory, certificatePaths, writeRuntimeConfig } from "./runtimeConfig.js";

let certificateRequestRunning = false;

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

interface CertificateRequestSettings {
  hostname: string;
  cloudflareToken: string;
}

export function startLetsEncryptCertificateRequest() {
  if (certificateRequestRunning) {
    throw new Error("A certificate request is already running");
  }

  const requestSettings = certificateRequestSettings();
  const started = saveCertificateResult({
    status: "requesting",
    requestedAt: new Date().toISOString(),
    error: undefined
  });

  certificateRequestRunning = true;
  setImmediate(() => {
    void requestLetsEncryptCertificate(requestSettings).finally(() => {
      certificateRequestRunning = false;
    });
  });

  return started;
}

export async function requestLetsEncryptCertificate(
  requestSettings = certificateRequestSettings()
) {
  const { hostname, cloudflareToken } = requestSettings;
  saveCertificateResult({ status: "requesting", requestedAt: new Date().toISOString(), error: undefined });

  try {
    return await issueLetsEncryptCertificate(hostname, cloudflareToken);
  } catch (error) {
    console.error(
      `Let's Encrypt certificate request for ${hostname} failed: ${
        error instanceof Error ? error.message : "Certificate request failed"
      }`
    );
    return saveCertificateResult({
      status: "failed",
      error: error instanceof Error ? error.message : "Certificate request failed"
    });
  }
}

function certificateRequestSettings(): CertificateRequestSettings {
  const settings = getRuntimeSettings(true);
  const hostname = settings.ssl.hostname.trim().toLowerCase();
  const cloudflareToken = settings.cloudflareToken?.trim() ?? "";
  if (!hostname) throw new Error("SSL hostname is required");
  if (settings.ssl.dnsProvider !== "cloudflare") throw new Error("Only Cloudflare DNS is supported");
  if (!cloudflareToken) throw new Error("Cloudflare token is required");

  return { hostname, cloudflareToken };
}

async function issueLetsEncryptCertificate(hostname: string, cloudflareToken: string) {
  console.info(`Starting Let's Encrypt certificate request for ${hostname}`);
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
  const certificate = await withTimeout(
    client.auto({
      csr,
      termsOfServiceAgreed: true,
      challengePriority: ["dns-01"],
      challengeCreateFn: async (authz, _challenge, keyAuthorization) => {
        const recordName = `_acme-challenge.${authz.identifier.value}`;
        const recordValue = keyAuthorization;
        const zone = await findCloudflareZone(hostname, cloudflareToken);
        await deleteExistingTxtRecords(zone.id, recordName, cloudflareToken);
        console.info(`Publishing DNS TXT challenge ${recordName} in Cloudflare zone ${zone.name}`);
        const record = await createTxtRecord(zone.id, recordName, recordValue, cloudflareToken);
        createdRecords.push({ zoneId: zone.id, recordId: record.id });
        await waitForDnsPropagation(recordName, recordValue);
      },
      challengeRemoveFn: async () => {
        await Promise.allSettled(
          createdRecords.map((record) =>
            deleteTxtRecord(record.zoneId, record.recordId, cloudflareToken)
          )
        );
      }
    }),
    certificateRequestTimeoutMs(),
    "Certificate request timed out before Let's Encrypt completed DNS validation"
  );

  fs.writeFileSync(paths.keyPath, certificateKey, { mode: 0o600 });
  fs.writeFileSync(paths.certPath, certificate, { mode: 0o600 });
  writeRuntimeConfig();

  const info = acme.crypto.readCertificateInfo(certificate);
  console.info(`Let's Encrypt certificate for ${hostname} is ready`);
  return saveCertificateResult({
    status: "ready",
    issuedAt: info.notBefore.toISOString(),
    expiresAt: info.notAfter.toISOString()
  });
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

async function deleteExistingTxtRecords(zoneId: string, name: string, token: string): Promise<void> {
  const records = await cloudflare<CloudflareRecord[]>(
    `/zones/${zoneId}/dns_records?type=TXT&name=${encodeURIComponent(name)}`,
    token
  );
  if (records.length === 0) return;

  console.info(`Deleting ${records.length} stale DNS TXT challenge record(s) for ${name}`);
  await Promise.allSettled(records.map((record) => deleteTxtRecord(zoneId, record.id, token)));
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
    signal: AbortSignal.timeout(30_000),
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

async function waitForDnsPropagation(recordName: string, expectedValue: string): Promise<void> {
  const timeoutMs = Math.max(30, Number(process.env.HAAI_DNS_PROPAGATION_SECONDS ?? 180)) * 1000;
  const startedAt = Date.now();
  let lastValues: string[] = [];

  while (Date.now() - startedAt < timeoutMs) {
    lastValues = await readTxtRecords(recordName);
    if (lastValues.includes(expectedValue)) {
      console.info(`DNS TXT challenge ${recordName} is visible to resolver`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error(
    `DNS TXT record ${recordName} did not publish the expected Let's Encrypt authorization value within ${Math.round(
      timeoutMs / 1000
    )} seconds. Last values: ${lastValues.length ? lastValues.join(", ") : "none"}`
  );
}

async function readTxtRecords(recordName: string): Promise<string[]> {
  try {
    const records = await dns.resolveTxt(recordName);
    return records.map((parts) => parts.join(""));
  } catch {
    return [];
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function certificateRequestTimeoutMs(): number {
  const seconds = Number(process.env.HAAI_CERT_REQUEST_TIMEOUT_SECONDS ?? 300);
  return Math.max(60, seconds) * 1000;
}
