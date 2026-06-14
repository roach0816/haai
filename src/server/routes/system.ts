import type { FastifyInstance } from "fastify";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { getConfig } from "../config.js";
import { getDb, nowIso } from "../db/database.js";
import { findSessionUser, hasAdminUser, latestRun } from "../db/repositories.js";
import { sessionCookieName, requireAuth } from "../auth.js";
import { updaterConfigPath, writeUpdaterConfig } from "../services/updateConfig.js";

const execFileAsync = promisify(execFile);

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/system/health", async (request) => {
    const updateRow = getUpdateState();
    return {
      setupComplete: hasAdminUser(),
      authenticated: hasAdminUser()
        ? Boolean(findSessionUser(request.cookies?.[sessionCookieName]))
        : false,
      version: getConfig().version,
      databasePath: getConfig().databasePath,
      lastRun: latestRun(),
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
        progress: updateRow.progress ? JSON.parse(String(updateRow.progress)) : undefined
      }
    };
  });

  app.get("/api/system/update", { preHandler: requireAuth }, async () => {
    return getUpdateState();
  });

  app.post("/api/system/update", { preHandler: requireAuth }, async (request) => {
    const body = z.object({ action: z.enum(["check", "apply"]) }).parse(request.body);
    if (body.action === "check") {
      try {
        const check = await runUpdaterCheck();
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
      try {
        await triggerApplyUpdate();
        getDb()
          .prepare("UPDATE update_state SET status = 'applying', checked_at = ?, error = NULL WHERE id = 1")
          .run(nowIso());
      } catch (error) {
        getDb()
          .prepare("UPDATE update_state SET status = 'failed', checked_at = ?, error = ? WHERE id = 1")
          .run(nowIso(), formatExecError(error));
      }
    }
    return getUpdateState();
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
  progress?: { label: string; percent: number };
}

function getUpdateState(): Record<string, unknown> {
  const dbRow = getDb()
    .prepare("SELECT * FROM update_state WHERE id = 1")
    .get() as Record<string, unknown>;
  const fileRow = readUpdaterStateFile();
  if (!fileRow?.checkedAt) return dbRow;
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
      progress: fileRow.progress ? JSON.stringify(fileRow.progress) : undefined
    };
  }
  return dbRow;
}

async function runUpdaterCheck(): Promise<UpdaterResult> {
  const script = updaterScriptPath();
  writeUpdaterConfig();
  const { stdout } = await execFileAsync(script, ["check"], {
    timeout: 30_000,
    env: updaterEnv()
  });
  return JSON.parse(stdout) as UpdaterResult;
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
