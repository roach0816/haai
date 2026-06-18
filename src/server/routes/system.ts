import type { FastifyInstance } from "fastify";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { getConfig } from "../config.js";
import { getDb, nowIso } from "../db/database.js";
import { addAppLog, findSessionUser, getRuntimeSettings, getUpdateSettings, hasAdminUser, latestRun, listAppLogs } from "../db/repositories.js";
import { sessionCookieName, requireAuth } from "../auth.js";
import { updaterConfigPath, writeUpdaterConfig } from "../services/updateConfig.js";
import { writeRuntimeConfig } from "../services/runtimeConfig.js";
import { clearRuntimeRestartRequired } from "../db/repositories.js";
import { scheduleApiRestart } from "../services/apiRestart.js";

const execFileAsync = promisify(execFile);

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/system/health", async (request) => {
    const updateRow = getUpdateState();
    const runtime = getRuntimeSettings(false);
    return {
      setupComplete: hasAdminUser(),
      authenticated: hasAdminUser()
        ? Boolean(findSessionUser(request.cookies?.[sessionCookieName]))
        : false,
      version: getConfig().version,
      databasePath: getConfig().databasePath,
      network: {
        host: getConfig().host,
        port: getConfig().port,
        protocol: getConfig().protocol
      },
      tls: {
        hostname: runtime.ssl.hostname,
        httpsEnabled: runtime.httpsEnabled,
        status: runtime.ssl.status,
        requestedAt: runtime.ssl.requestedAt,
        issuedAt: runtime.ssl.issuedAt,
        expiresAt: runtime.ssl.expiresAt,
        error: runtime.ssl.error
      },
      lastRun: latestRun(),
      deployment: deploymentInfo(),
      update: {
        currentVersion: String(updateRow.current_version),
        availableVersion: updateRow.available_version
          ? String(updateRow.available_version)
          : undefined,
        checkedAt: updateRow.checked_at ? String(updateRow.checked_at) : undefined,
        status: updateRow.status,
        error: updateRow.error ? String(updateRow.error) : undefined,
        releaseUrl: updateRow.release_url ? String(updateRow.release_url) : undefined,
        releaseNotes: updateRow.release_notes ? String(updateRow.release_notes) : undefined,
        archiveName: updateRow.archive_name ? String(updateRow.archive_name) : undefined,
        updateInstructions: updateRow.update_instructions
          ? JSON.parse(String(updateRow.update_instructions))
          : undefined,
        progress: updateRow.progress ? JSON.parse(String(updateRow.progress)) : undefined
      }
    };
  });

  app.get(
    "/api/system/update",
    {
      preHandler: requireAuth,
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } }
    },
    async () => getUpdateState()
  );

  app.get("/api/system/logs", { preHandler: requireAuth }, async (request) => {
    const query = z.object({
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(50).optional()
    }).parse(request.query);
    return listAppLogs(query.page ?? 1, query.pageSize ?? 25);
  });

  app.post(
    "/api/system/update",
    {
      preHandler: requireAuth,
      config: { rateLimit: { max: 10, timeWindow: "10 minutes" } }
    },
    async (request) => {
      const body = z.object({ action: z.enum(["check", "apply"]) }).parse(request.body);
      if (body.action === "check") {
        addAppLog({ source: "updates", message: "Update check started" });
        try {
          const check = await runUpdaterCheck();
          writeUpdaterStateFile(check);
          addAppLog({
            source: "updates",
            message: check.status === "available" ? "Update available" : "System is up to date",
            details: check
          });
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
        } catch (error) {
          addAppLog({
            level: "error",
            source: "updates",
            message: "Update check failed",
            details: error instanceof Error ? error.message : "Update check failed"
          });
          const failed = readUpdaterStateFile();
          getDb()
            .prepare(
              "UPDATE update_state SET status = 'failed', checked_at = ?, error = ? WHERE id = 1"
            )
            .run(
              failed?.checkedAt ?? nowIso(),
              failed?.error ?? (error instanceof Error ? error.message : "Update check failed")
            );
        }
      } else {
        addAppLog({ source: "updates", message: "Update apply requested" });
        try {
          if (!deploymentInfo().updateApplySupported) {
            const current = getUpdateState();
            const checkedAt = nowIso();
            const instructions = updateInstructions(String(current.available_version ?? ""));
            writeUpdaterStateFile({
              status: current.available_version ? "available" : "idle",
              checkedAt,
              currentVersion: String(current.current_version ?? getConfig().version),
              availableVersion: current.available_version ? String(current.available_version) : undefined,
              releaseUrl: current.release_url ? String(current.release_url) : undefined,
              releaseNotes: current.release_notes ? String(current.release_notes) : undefined,
              archiveName: current.archive_name ? String(current.archive_name) : undefined,
              updateInstructions: instructions,
              progress: current.progress ? JSON.parse(String(current.progress)) : undefined
            });
            addAppLog({
              source: "updates",
              message: "Container update apply skipped",
              details: "Container deployments update by pulling a new image or upgrading the Helm chart."
            });
            return getUpdateState();
          }
          markUpdateApplying();
          await triggerApplyUpdate();
          getDb()
            .prepare("UPDATE update_state SET status = 'applying', checked_at = ?, error = NULL WHERE id = 1")
            .run(nowIso());
        } catch (error) {
          addAppLog({ level: "error", source: "updates", message: "Update apply failed", details: formatExecError(error) });
          getDb()
            .prepare("UPDATE update_state SET status = 'failed', checked_at = ?, error = ? WHERE id = 1")
            .run(nowIso(), formatExecError(error));
        }
      }
      return getUpdateState();
    }
  );

  app.post("/api/system/restart", { preHandler: requireAuth }, async (_request, reply) => {
    writeRuntimeConfig();
    clearRuntimeRestartRequired();
    addAppLog({ source: "system", message: "API service restart requested" });
    scheduleApiRestart((error) => {
      addAppLog({ level: "error", source: "system", message: "API service restart failed", details: error instanceof Error ? error.message : "Restart failed" });
      app.log.error({ err: error }, "Failed to restart API service");
    });
    return reply.code(202).send({ restarting: true });
  });
}

interface UpdaterResult {
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

function getUpdateState(): Record<string, unknown> {
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

function markUpdateApplying(): void {
  const current = getUpdateState();
  const checkedAt = nowIso();
  getDb()
    .prepare("UPDATE update_state SET status = 'applying', checked_at = ?, error = NULL WHERE id = 1")
    .run(checkedAt);
  writeUpdaterStateFile({
    status: "applying",
    checkedAt,
    currentVersion: String(current.current_version ?? getConfig().version),
    availableVersion: current.available_version ? String(current.available_version) : undefined,
    releaseUrl: current.release_url ? String(current.release_url) : undefined,
    releaseNotes: current.release_notes ? String(current.release_notes) : undefined,
    archiveName: current.archive_name ? String(current.archive_name) : undefined,
    progress: { label: "Starting update", percent: 5 }
  });
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

async function triggerApplyUpdate(): Promise<void> {
  writeUpdaterConfig();
  if (process.env.HAAI_UPDATE_APPLY_MODE === "direct") {
    await execFileAsync(updaterScriptPath(), ["apply"], {
      timeout: 1_000,
      env: updaterEnv()
    });
    return;
  }

  await execFileAsync("sudo", ["-n", "systemctl", "start", "haai-apply-update.service"], {
    timeout: 10_000
  });
}

function formatExecError(error: unknown): string {
  if (error && typeof error === "object") {
    const execError = error as { message?: string; stderr?: string; stdout?: string };
    return [execError.message, execError.stderr, execError.stdout].filter(Boolean).join("\n");
  }
  return error instanceof Error ? error.message : "Update apply failed";
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

function deploymentInfo(): { mode: "appliance" | "container"; updateApplySupported: boolean } {
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

function updateInstructions(version?: string): string[] {
  if (deploymentInfo().mode === "appliance") return [];
  const target = normalizeVersion(version ?? "");
  const image = target ? `ghcr.io/roach0816/haai:${target}` : "ghcr.io/roach0816/haai:<version>";
  return [
    `Docker Compose: set the image tag to ${image}, then run docker compose pull && docker compose up -d --remove-orphans.`,
    `Kubernetes/Rancher: upgrade the Helm release to chart version ${target || "<version>"} and image tag ${target || "<version>"}.`,
    "Keep /data persistent so SQLite state, settings, secrets, certificates, logs, and history remain attached after the container is replaced."
  ];
}

function updaterEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HAAI_UPDATE_CONFIG_PATH: updaterConfigPath()
  };
}

function updaterScriptPath(): string {
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

function writeUpdaterStateFile(result: UpdaterResult): void {
  const statePath =
    process.env.HAAI_UPDATE_STATE_PATH ??
    path.join(getConfig().dataDir, "update-check.json");
  fs.writeFileSync(statePath, JSON.stringify(result, null, 2), { mode: 0o640 });
}
