import type { FastifyInstance } from "fastify";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { getConfig } from "../config.js";
import { getDb, nowIso } from "../db/database.js";
import { addAppLog, findSessionUser, getRuntimeSettings, hasAdminUser, latestRun, listAppLogs } from "../db/repositories.js";
import { sessionCookieName, requireAuth } from "../auth.js";
import { updaterConfigPath, writeUpdaterConfig } from "../services/updateConfig.js";
import { writeRuntimeConfig } from "../services/runtimeConfig.js";
import { clearRuntimeRestartRequired } from "../db/repositories.js";
import { scheduleApiRestart } from "../services/apiRestart.js";
import {
  checkForUpdates,
  deploymentInfo,
  getUpdateState,
  updaterScriptPath,
  updateInstructions,
  writeUpdaterStateFile
} from "../services/updateCheck.js";

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
        await checkForUpdates();
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
