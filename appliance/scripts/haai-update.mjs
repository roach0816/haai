#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const action = process.argv[2] ?? "check";
const fileConfig = readFileConfig();
const appDir = process.env.HAAI_APP_DIR ?? "/opt/haai";
const dataDir = process.env.HAAI_DATA_DIR ?? "/var/lib/haai";
const backupDir = process.env.HAAI_BACKUP_DIR ?? path.join(dataDir, "backups");
const updateSource = envOrConfig("HAAI_UPDATE_SOURCE", "source", "github");
const manifestUrl = envOrConfig("HAAI_UPDATE_MANIFEST_URL", "manifestUrl", "");
const githubOwner = envOrConfig("HAAI_GITHUB_OWNER", "githubOwner", "");
const githubRepo = envOrConfig("HAAI_GITHUB_REPO", "githubRepo", "");
const githubToken = envOrConfig("HAAI_GITHUB_TOKEN", "githubToken", "");
const serviceName = process.env.HAAI_SERVICE_NAME ?? "haai-api.service";
const statePath = process.env.HAAI_UPDATE_STATE_PATH ?? path.join(dataDir, "update-check.json");

fs.mkdirSync(backupDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

try {
  if (action === "check") {
    const result = await checkForUpdate();
    writeState(result);
    console.log(JSON.stringify(result, null, 2));
  } else if (action === "apply") {
    const result = await applyUpdate();
    writeState(result);
    console.log(JSON.stringify(result, null, 2));
  } else if (action === "rollback") {
    const result = rollback();
    writeState(result);
    console.log(JSON.stringify(result, null, 2));
  } else {
    throw new Error("Usage: haai-update [check|apply|rollback]");
  }
} catch (error) {
  const result = {
    status: "failed",
    checkedAt: new Date().toISOString(),
    currentVersion: readCurrentVersion(),
    error: error instanceof Error ? error.message : "Unknown updater error"
  };
  writeState(result);
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

async function checkForUpdate() {
  const manifest = await readReleaseMetadata();
  const currentVersion = readCurrentVersion();
  const updateAvailable = Boolean(
    manifest.version && normalizeVersion(manifest.version) !== normalizeVersion(currentVersion)
  );
  return {
    status: updateAvailable ? "available" : "idle",
    checkedAt: new Date().toISOString(),
    currentVersion,
    availableVersion: manifest.version,
    updateAvailable,
    releaseUrl: manifest.releaseUrl,
    releaseNotes: manifest.releaseNotes,
    archiveName: manifest.archiveName,
    progress: {
      label: updateAvailable ? "Update available" : "System is up to date",
      percent: 100
    },
    manifest
  };
}

async function applyUpdate() {
  const manifest = await readReleaseMetadata();
  const currentVersion = readCurrentVersion();
  if (!manifest.version || !manifest.archiveUrl || !manifest.sha256) {
    throw new Error("Release metadata must include version, archiveUrl, and sha256");
  }
  if (normalizeVersion(manifest.version) === normalizeVersion(currentVersion)) {
    return {
      status: "idle",
      checkedAt: new Date().toISOString(),
      currentVersion,
      availableVersion: manifest.version,
      updateAvailable: false,
      message: "Already running requested version"
    };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "haai-update-"));
  const archiveDownloadUrl = resolveArchiveUrl(manifest.archiveUrl);
  const archivePath = path.join(
    tempDir,
    path.basename(new URL(archiveDownloadUrl).pathname) || `haai-${manifest.version}.tgz`
  );
  const extractDir = path.join(tempDir, "extract");
  fs.mkdirSync(extractDir);

  writeState(applyProgress(currentVersion, manifest, "Downloading release", 20));
  await downloadFile(archiveDownloadUrl, archivePath, manifest.headers);

  writeState(applyProgress(currentVersion, manifest, "Verifying checksum", 40));
  verifySha256(archivePath, manifest.sha256);

  writeState(applyProgress(currentVersion, manifest, "Extracting release", 55));
  run("tar", ["-xzf", archivePath, "-C", extractDir]);

  const releaseRoot = normalizeReleaseRoot(extractDir);
  assertReleaseLooksValid(releaseRoot);

  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
  const backupPath = path.join(backupDir, `haai-${currentVersion}-${timestamp}.tgz`);
  writeState(applyProgress(currentVersion, manifest, "Backing up current version", 70));
  run("tar", ["-C", appDir, "-czf", backupPath, "."]);

  try {
    writeState(applyProgress(currentVersion, manifest, "Installing release", 85));
    run("systemctl", ["stop", serviceName]);
    replaceDirectory(releaseRoot, appDir);
    if (fs.existsSync(path.join(appDir, "package-lock.json"))) {
      run("npm", ["ci", "--omit=dev"], { cwd: appDir });
    }
    applyApplianceMetadata(currentVersion, manifest);
    run("systemctl", ["start", serviceName]);
  } catch (error) {
    restoreBackup(backupPath);
    throw error;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  return {
    status: "idle",
    checkedAt: new Date().toISOString(),
    currentVersion: manifest.version,
    availableVersion: manifest.version,
    updateAvailable: false,
    releaseUrl: manifest.releaseUrl,
    releaseNotes: manifest.releaseNotes,
    archiveName: manifest.archiveName,
    progress: { label: "Update complete", percent: 100 },
    backupPath,
    message: `Updated from ${currentVersion} to ${manifest.version}`
  };
}

function applyApplianceMetadata(currentVersion, manifest) {
  const installer = path.join(appDir, "appliance", "scripts", "install-systemd.sh");
  if (!fs.existsSync(installer)) return;
  writeState(applyProgress(currentVersion, manifest, "Installing appliance services", 92));
  run("bash", [installer], {
    cwd: appDir,
    env: {
      ...process.env,
      HAAI_APP_DIR: appDir,
      HAAI_DATA_DIR: dataDir
    }
  });
}

function rollback() {
  const backups = fs
    .readdirSync(backupDir)
    .filter((file) => file.endsWith(".tgz"))
    .sort()
    .reverse();
  if (!backups.length) throw new Error("No backup archive found");
  const backupPath = path.join(backupDir, backups[0]);
  restoreBackup(backupPath);
  return {
    status: "idle",
    checkedAt: new Date().toISOString(),
    currentVersion: readCurrentVersion(),
    backupPath,
    message: `Rolled back using ${backupPath}`
  };
}

async function readReleaseMetadata() {
  if (updateSource === "github") {
    return readGitHubRelease();
  }
  if (updateSource === "manifest") {
    return readManifest();
  }
  throw new Error("HAAI_UPDATE_SOURCE must be github or manifest");
}

async function readGitHubRelease() {
  if (!githubOwner || !githubRepo || !githubToken) {
    throw new Error("HAAI_GITHUB_OWNER, HAAI_GITHUB_REPO, and HAAI_GITHUB_TOKEN are required");
  }

  const releases = await githubFetchJson(
    `https://api.github.com/repos/${encodeURIComponent(githubOwner)}/${encodeURIComponent(githubRepo)}/releases?per_page=30`
  );
  if (!Array.isArray(releases)) {
    throw new Error("GitHub releases response was not a list");
  }
  const release = selectGitHubRelease(releases);
  if (!release) {
    throw new Error("No published GitHub releases found for this repository");
  }
  const version = normalizeVersion(String(release.tag_name ?? release.name ?? ""));
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const archiveAsset =
    assets.find((asset) => String(asset.name ?? "") === `haai-${version}.tgz`) ??
    assets.find((asset) => /^haai-.+\.tgz$/.test(String(asset.name ?? ""))) ??
    assets.find((asset) => String(asset.name ?? "").endsWith(".tgz"));

  if (!archiveAsset?.url) {
    throw new Error("Latest GitHub release does not include a haai-<version>.tgz asset");
  }

  const checksumAsset = assets.find(
    (asset) => String(asset.name ?? "") === `${archiveAsset.name}.sha256`
  );
  const sha256 =
    parseGitHubDigest(archiveAsset.digest) ??
    (checksumAsset?.url ? await readGitHubChecksumAsset(String(checksumAsset.url)) : "");

  if (!sha256) {
    throw new Error("Latest GitHub release asset is missing a SHA-256 digest or .sha256 asset");
  }

  return {
    source: "github",
    version,
    releaseUrl: release.html_url,
    releaseNotes: String(release.body ?? "").trim(),
    archiveUrl: String(archiveAsset.url),
    archiveName: String(archiveAsset.name),
    sha256,
    headers: githubDownloadHeaders()
  };
}

function applyProgress(currentVersion, manifest, label, percent) {
  return {
    status: "applying",
    checkedAt: new Date().toISOString(),
    currentVersion,
    availableVersion: manifest.version,
    releaseUrl: manifest.releaseUrl,
    releaseNotes: manifest.releaseNotes,
    archiveName: manifest.archiveName,
    progress: { label, percent }
  };
}

function selectGitHubRelease(releases) {
  const published = releases.filter((release) => !release.draft);
  const semverReleases = published
    .map((release) => ({ release, version: parseSemver(normalizeVersion(String(release.tag_name ?? ""))) }))
    .filter((item) => item.version);
  if (semverReleases.length) {
    semverReleases.sort((a, b) => compareSemver(b.version, a.version));
    return semverReleases[0].release;
  }
  return published[0];
}

async function readManifest() {
  if (!manifestUrl) {
    throw new Error("HAAI_UPDATE_MANIFEST_URL is not configured");
  }
  const response = await fetch(manifestUrl, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Update manifest returned ${response.status}`);
  }
  const manifest = await response.json();
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Manifest must be a JSON object");
  }
  return manifest;
}

async function githubFetchJson(url) {
  const response = await fetch(url, { headers: githubJsonHeaders() });
  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}`);
  }
  return response.json();
}

async function readGitHubChecksumAsset(url) {
  const response = await fetch(url, { headers: githubDownloadHeaders() });
  if (!response.ok) {
    throw new Error(`GitHub checksum asset returned ${response.status}`);
  }
  const text = await response.text();
  const match = text.match(/[a-fA-F0-9]{64}/);
  return match?.[0] ?? "";
}

function githubJsonHeaders() {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${githubToken}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "haai-updater"
  };
}

function githubDownloadHeaders() {
  return {
    Accept: "application/octet-stream",
    Authorization: `Bearer ${githubToken}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "haai-updater"
  };
}

function parseGitHubDigest(digest) {
  const value = String(digest ?? "");
  const match = value.match(/^sha256:([a-fA-F0-9]{64})$/);
  return match?.[1] ?? "";
}

function readCurrentVersion() {
  const packagePath = path.join(appDir, "package.json");
  if (process.env.HAAI_CURRENT_VERSION) return process.env.HAAI_CURRENT_VERSION;
  if (!fs.existsSync(packagePath)) return "0.0.0";
  return JSON.parse(fs.readFileSync(packagePath, "utf8")).version ?? "0.0.0";
}

async function downloadFile(url, destination, headers = undefined) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Release archive returned ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destination, bytes);
}

function verifySha256(filePath, expected) {
  const actual = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  if (actual.toLowerCase() !== String(expected).toLowerCase()) {
    throw new Error(`SHA-256 mismatch. Expected ${expected}, got ${actual}`);
  }
}

function normalizeVersion(version) {
  return String(version).trim().replace(/^v/i, "");
}

function parseSemver(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function compareSemver(a, b) {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

function resolveArchiveUrl(archiveUrl) {
  if (/^https?:\/\//i.test(archiveUrl)) return archiveUrl;
  if (manifestUrl) return new URL(archiveUrl, manifestUrl).toString();
  return archiveUrl;
}

function normalizeReleaseRoot(extractDir) {
  const entries = fs.readdirSync(extractDir);
  if (entries.length === 1) {
    const only = path.join(extractDir, entries[0]);
    if (fs.statSync(only).isDirectory()) return only;
  }
  return extractDir;
}

function assertReleaseLooksValid(releaseRoot) {
  for (const required of ["package.json", "dist/server/index.js", "dist/client/index.html"]) {
    if (!fs.existsSync(path.join(releaseRoot, required))) {
      throw new Error(`Release archive is missing ${required}`);
    }
  }
}

function replaceDirectory(source, destination) {
  const tempOld = `${destination}.old-${Date.now()}`;
  fs.renameSync(destination, tempOld);
  fs.mkdirSync(destination, { recursive: true });
  run("cp", ["-a", `${source}/.`, destination]);
  fs.rmSync(tempOld, { recursive: true, force: true });
}

function restoreBackup(backupPath) {
  run("systemctl", ["stop", serviceName], { allowFailure: true });
  fs.rmSync(appDir, { recursive: true, force: true });
  fs.mkdirSync(appDir, { recursive: true });
  run("tar", ["-C", appDir, "-xzf", backupPath]);
  run("systemctl", ["start", serviceName], { allowFailure: true });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit"
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function writeState(result) {
  fs.writeFileSync(statePath, JSON.stringify(redactState(result), null, 2), { mode: 0o640 });
}

function redactState(value) {
  if (Array.isArray(value)) return value.map(redactState);
  if (!value || typeof value !== "object") return value;

  const redacted = {};
  for (const [key, item] of Object.entries(value)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === "headers") continue;
    if (lowerKey.includes("token") || lowerKey === "authorization") {
      redacted[key] = "[redacted]";
      continue;
    }
    redacted[key] = redactState(item);
  }
  return redacted;
}

function envOrConfig(envName, configName, fallback) {
  const envValue = process.env[envName];
  if (envValue) return envValue;
  return fileConfig[configName] ?? fallback;
}

function readFileConfig() {
  const configPath =
    process.env.HAAI_UPDATE_CONFIG_PATH ?? path.join(process.env.HAAI_DATA_DIR ?? "/var/lib/haai", "updater-config.json");
  if (!fs.existsSync(configPath)) return {};
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}
