import fs from "node:fs";
import path from "node:path";
import { getConfig } from "../config.js";
import { getDb, nowIso } from "../db/database.js";
import { addAppLog, getUpdateSettings } from "../db/repositories.js";

export interface UpdaterResult {
  status: string;
  checkedAt?: string;
  currentVersion: string;
  availableVersion?: string;
  error?: string;
  releaseUrl?: string;
  releaseNotes?: string;
  archiveName?: string;
  updateInstructions?: string[];
  progress?: { label: string; percent: number };
}

let activeCheck: Promise<Record<string, unknown>> | undefined;

export function getUpdateState(): Record<string, unknown> {
  const dbRow = getDb()
    .prepare("SELECT * FROM update_state WHERE id = 1")
    .get() as Record<string, unknown>;
  const fileRow = readUpdaterStateFile();
  if (!fileRow?.checkedAt) return dbRow;
  if (String(dbRow.status) === "applying" && fileRow.status === "available") return dbRow;
  if (!dbRow.checked_at || String(fileRow.checkedAt) >= String(dbRow.checked_at)) {
    return {
      status: fileRow.status,
      current_version: fileRow.currentVersion,
      available_version: fileRow.availableVersion,
      checked_at: fileRow.checkedAt,
      error: fileRow.error,
      release_url: fileRow.releaseUrl,
      release_notes: fileRow.releaseNotes,
      archive_name: fileRow.archiveName,
      update_instructions: fileRow.updateInstructions ? JSON.stringify(fileRow.updateInstructions) : undefined,
      progress: fileRow.progress ? JSON.stringify(fileRow.progress) : undefined
    };
  }
  return dbRow;
}

export async function checkForUpdates(): Promise<Record<string, unknown>> {
  if (activeCheck) return activeCheck;
  activeCheck = runAndPersistUpdateCheck().finally(() => {
    activeCheck = undefined;
  });
  return activeCheck;
}

export async function checkForUpdatesIfDue(intervalMs: number): Promise<boolean> {
  const state = getUpdateState();
  if (String(state.status) === "applying") return false;

  const checkedAt = state.checked_at ? new Date(String(state.checked_at)).getTime() : Number.NaN;
  if (Number.isFinite(checkedAt) && Date.now() - checkedAt < intervalMs) return false;

  await checkForUpdates();
  return true;
}

async function runAndPersistUpdateCheck(): Promise<Record<string, unknown>> {
  addAppLog({ source: "updates", message: "Update check started" });
  try {
    const check = await runUpdaterCheck();
    writeUpdaterStateFile(check);
    getDb()
      .prepare(
        "UPDATE update_state SET status = ?, current_version = ?, available_version = ?, checked_at = ?, error = NULL WHERE id = 1"
      )
      .run(
        check.status,
        check.currentVersion,
        check.availableVersion ?? null,
        check.checkedAt ?? nowIso()
      );
    addAppLog({
      source: "updates",
      message: check.status === "available" ? "Update available" : "System is up to date",
      details: check
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update check failed";
    const failed: UpdaterResult = {
      status: "failed",
      checkedAt: nowIso(),
      currentVersion: getConfig().version,
      error: message,
      progress: { label: "Update check failed", percent: 100 }
    };
    writeUpdaterStateFile(failed);
    getDb()
      .prepare(
        "UPDATE update_state SET status = 'failed', current_version = ?, checked_at = ?, error = ? WHERE id = 1"
      )
      .run(failed.currentVersion, failed.checkedAt, message);
    addAppLog({
      level: "error",
      source: "updates",
      message: "Update check failed",
      details: message
    });
  }
  return getUpdateState();
}

async function runUpdaterCheck(): Promise<UpdaterResult> {
  const release = await readReleaseMetadata();
  const currentVersion = getConfig().version;
  const updateAvailable = Boolean(
    release.version && normalizeVersion(release.version) !== normalizeVersion(currentVersion)
  );
  return {
    status: updateAvailable ? "available" : "idle",
    checkedAt: nowIso(),
    currentVersion,
    availableVersion: release.version,
    releaseUrl: release.releaseUrl,
    releaseNotes: release.releaseNotes,
    archiveName: release.archiveName,
    updateInstructions: updateInstructions(release.version),
    progress: {
      label: updateAvailable ? "Update available" : "System is up to date",
      percent: 100
    }
  };
}

async function readReleaseMetadata(): Promise<{
  version: string;
  releaseUrl?: string;
  releaseNotes?: string;
  archiveName?: string;
}> {
  const settings = getUpdateSettings(true);
  if (settings.source === "manifest") return readManifestMetadata(settings.manifestUrl);
  return readGitHubReleaseMetadata(settings.githubOwner, settings.githubRepo, settings.githubToken ?? "");
}

async function readGitHubReleaseMetadata(owner: string, repo: string, token: string) {
  if (!owner || !repo) {
    throw new Error("GitHub owner and repo are required for update checks");
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "haai-updater"
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases?per_page=30`,
    { headers }
  );
  if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);

  const releases = await response.json();
  if (!Array.isArray(releases)) throw new Error("GitHub releases response was not a list");

  const release = selectGitHubRelease(releases);
  if (!release) throw new Error("No published GitHub releases found for this repository");

  const version = normalizeVersion(String(release.tag_name ?? release.name ?? ""));
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const archiveAsset =
    assets.find((asset) => String(asset.name ?? "") === `haai-${version}.tgz`) ??
    assets.find((asset) => /^haai-.+\.tgz$/.test(String(asset.name ?? ""))) ??
    assets.find((asset) => String(asset.name ?? "").endsWith(".tgz"));

  return {
    version,
    releaseUrl: release.html_url ? String(release.html_url) : undefined,
    releaseNotes: String(release.body ?? "").trim(),
    archiveName: archiveAsset?.name ? String(archiveAsset.name) : undefined
  };
}

async function readManifestMetadata(manifestUrl: string) {
  if (!manifestUrl) throw new Error("Manifest URL is required for update checks");
  const response = await fetch(manifestUrl, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Update manifest returned ${response.status}`);
  const manifest = (await response.json()) as Record<string, unknown>;
  return {
    version: normalizeVersion(String(manifest.version ?? "")),
    releaseUrl: manifest.releaseUrl ? String(manifest.releaseUrl) : undefined,
    releaseNotes: manifest.releaseNotes ? String(manifest.releaseNotes) : undefined,
    archiveName: manifest.archiveName ? String(manifest.archiveName) : undefined
  };
}

function selectGitHubRelease(releases: Array<Record<string, unknown>>) {
  const published = releases.filter((release) => !release.draft);
  const semverReleases = published
    .map((release) => ({
      release,
      version: parseSemver(normalizeVersion(String(release.tag_name ?? "")))
    }))
    .filter(
      (
        item
      ): item is {
        release: Record<string, unknown>;
        version: { major: number; minor: number; patch: number };
      } => Boolean(item.version)
    );
  if (semverReleases.length) {
    semverReleases.sort((left, right) => compareSemver(right.version, left.version));
    return semverReleases[0].release;
  }
  return published[0];
}

function normalizeVersion(version: string): string {
  return String(version).trim().replace(/^v/i, "");
}

function parseSemver(version: string): { major: number; minor: number; patch: number } | null {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function compareSemver(
  left: { major: number; minor: number; patch: number },
  right: { major: number; minor: number; patch: number }
): number {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

export function deploymentInfo(): { mode: "appliance" | "container"; updateApplySupported: boolean } {
  const explicitMode = process.env.HAAI_DEPLOYMENT_MODE;
  const mode = explicitMode === "appliance" ? "appliance" : explicitMode === "container" ? "container" : inferDeploymentMode();
  return {
    mode,
    updateApplySupported: mode === "appliance" && fs.existsSync(updaterScriptPath())
  };
}

function inferDeploymentMode(): "appliance" | "container" {
  if (getConfig().dataDir === "/data") return "container";
  return fs.existsSync(updaterScriptPath()) ? "appliance" : "container";
}

export function updateInstructions(version?: string): string[] {
  if (deploymentInfo().mode === "appliance") return [];
  const target = normalizeVersion(version ?? "");
  const image = target ? `ghcr.io/roach0816/haai:${target}` : "ghcr.io/roach0816/haai:<version>";
  return [
    `Docker Compose: set the image tag to ${image}, then run docker compose pull && docker compose up -d --remove-orphans.`,
    `Kubernetes/Rancher: upgrade the Helm release to chart version ${target || "<version>"} and image tag ${target || "<version>"}.`,
    "Keep /data persistent so SQLite state, settings, secrets, certificates, logs, and history remain attached after the container is replaced."
  ];
}

export function updaterScriptPath(): string {
  return (
    process.env.HAAI_UPDATE_SCRIPT ??
    path.resolve(process.cwd(), "appliance", "scripts", "haai-update")
  );
}

function readUpdaterStateFile(): UpdaterResult | null {
  const statePath =
    process.env.HAAI_UPDATE_STATE_PATH ??
    path.join(getConfig().dataDir, "update-check.json");
  if (!fs.existsSync(statePath)) return null;
  return JSON.parse(fs.readFileSync(statePath, "utf8")) as UpdaterResult;
}

export function writeUpdaterStateFile(result: UpdaterResult): void {
  const statePath =
    process.env.HAAI_UPDATE_STATE_PATH ??
    path.join(getConfig().dataDir, "update-check.json");
  fs.writeFileSync(statePath, JSON.stringify(result, null, 2), { mode: 0o640 });
}
