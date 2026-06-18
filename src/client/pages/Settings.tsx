import { FormEvent, useEffect, useState } from "react";
import type {
  HomeAssistantSettings,
  RuntimeSettings,
  SystemHealth,
  UpdateSettings
} from "../../shared/types";
import { api } from "../lib/api";

export function Settings() {
  const [ha, setHa] = useState<HomeAssistantSettings>({
    baseUrl: "",
    tokenConfigured: false,
    verifyTls: true,
    excludedDomains: [],
    excludedEntities: []
  });
  const [haToken, setHaToken] = useState("");
  const [update, setUpdate] = useState<UpdateSettings>({
    source: "github",
    githubOwner: "",
    githubRepo: "",
    githubTokenConfigured: false,
    manifestUrl: ""
  });
  const [runtime, setRuntime] = useState<RuntimeSettings>({
    httpPort: 8787,
    httpsPort: 443,
    httpsEnabled: false,
    restartRequired: false,
    ssl: {
      hostname: "",
      dnsProvider: "cloudflare",
      dnsTokenConfigured: false,
      status: "not_configured"
    }
  });
  const [githubToken, setGithubToken] = useState("");
  const [cloudflareToken, setCloudflareToken] = useState("");
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateApplying, setUpdateApplying] = useState(false);
  const [certificateRequesting, setCertificateRequesting] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [updateSettingsOpen, setUpdateSettingsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      api.getHomeAssistantSettings(),
      api.getUpdateSettings(),
      api.getRuntimeSettings(),
      api.health()
    ]).then(
      ([haSettings, updateSettings, runtimeSettings, healthState]) => {
        if (cancelled) return;
        setHa(haSettings);
        setUpdate(updateSettings);
        setRuntime(runtimeSettings);
        setHealth(healthState);
      }
    );

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!updateApplying && health?.update.status !== "applying") return;
    const timer = window.setInterval(() => {
      void api.health()
        .then((nextHealth) => {
          setHealth(nextHealth);
          if (nextHealth.update.status === "failed") {
            setUpdateApplying(false);
            setError(nextHealth.update.error ?? "Update failed.");
            return;
          }
          if (nextHealth.update.status === "idle" && versionsMatch(nextHealth.version, nextHealth.update.currentVersion)) {
            setUpdateApplying(false);
            setMessage(`Updated to ${nextHealth.version}.`);
          }
        })
        .catch(() => {
          // The API may briefly restart during install; keep polling.
        });
    }, 2500);
    return () => window.clearInterval(timer);
  }, [health?.update.status, updateApplying]);

  useEffect(() => {
    if (!certificateRequesting && runtime.ssl.status !== "requesting") return;
    const timer = window.setInterval(() => {
      void api.getRuntimeSettings()
        .then((nextRuntime) => {
          setRuntime(nextRuntime);
          if (nextRuntime.ssl.status === "ready") {
            setCertificateRequesting(false);
            setMessage("Certificate request complete. Restart the service to use HTTPS.");
          }
          if (nextRuntime.ssl.status === "failed") {
            setCertificateRequesting(false);
            setError(nextRuntime.ssl.error ?? "Certificate request failed");
          }
        })
        .catch(() => {
          // Keep polling; certificate requests can overlap short service restarts.
        });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [certificateRequesting, runtime.ssl.status]);

  async function saveHa(event: FormEvent) {
    event.preventDefault();
    setError("");
    const saved = await api.saveHomeAssistantSettings({ ...ha, token: haToken || undefined });
    setHa(saved);
    setHaToken("");
    setMessage("Home Assistant settings saved.");
  }

  async function testHa() {
    setError("");
    try {
      const result = await api.testHomeAssistant();
      setMessage(`${result.message}${result.version ? ` Version ${result.version}.` : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection test failed");
    }
  }

  async function saveUpdate(event: FormEvent) {
    event.preventDefault();
    setError("");
    const saved = await api.saveUpdateSettings({
      ...update,
      githubToken: githubToken || undefined
    });
    setUpdate(saved);
    setGithubToken("");
    setMessage("Update settings saved.");
    if (updateSettingsReady(saved)) {
      await runUpdateCheck({ showMessage: true });
    }
  }

  async function saveRuntime(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const saved = await api.saveRuntimeSettings(runtimeSettingsPayload(runtime, cloudflareToken));
      setRuntime(saved);
      setCloudflareToken("");
      setMessage("Network and TLS settings saved. Restart the service to apply listener changes.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network settings failed to save");
    }
  }

  async function requestCertificate() {
    setError("");
    setCertificateRequesting(true);
    let keepPolling = false;
    try {
      const settings = await api.saveRuntimeSettings(runtimeSettingsPayload(runtime, cloudflareToken));
      setRuntime(settings);
      setCloudflareToken("");
      const saved = await api.requestCertificate();
      setRuntime(saved);
      if (saved.ssl.status === "failed") {
        setError(saved.ssl.error ?? "Certificate request failed");
      } else if (saved.ssl.status === "requesting") {
        keepPolling = true;
        setMessage("Certificate request started. The app will keep checking for completion.");
      } else {
        setMessage("Certificate request complete. Restart the service to use HTTPS.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Certificate request failed");
    } finally {
      if (!keepPolling) setCertificateRequesting(false);
    }
  }

  async function renewCertificate() {
    setError("");
    setCertificateRequesting(true);
    let keepPolling = false;
    try {
      const saved = await api.renewCertificate();
      setRuntime(saved);
      if (saved.ssl.status === "failed") {
        setError(saved.ssl.error ?? "Certificate renewal failed");
      } else if (saved.ssl.status === "requesting") {
        keepPolling = true;
        setMessage("Certificate renewal started. The app will restart automatically if HTTPS is enabled.");
      } else {
        setMessage("Certificate renewal complete.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Certificate renewal failed");
    } finally {
      if (!keepPolling) setCertificateRequesting(false);
    }
  }

  async function resetCertificate() {
    setError("");
    try {
      const saved = await api.resetCertificate();
      setRuntime(saved);
      setCertificateRequesting(false);
      setMessage("Certificate status reset.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Certificate reset failed");
    }
  }

  async function restartService() {
    setError("");
    setRestarting(true);
    try {
      await api.restartService();
      setMessage("Restart requested. The app may be unavailable for a few seconds.");
      window.setTimeout(() => {
        window.location.reload();
      }, 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Service restart failed");
      setRestarting(false);
    }
  }

  async function checkUpdate() {
    await runUpdateCheck({ showMessage: true });
  }

  async function runUpdateCheck(options: { showMessage: boolean }) {
    setError("");
    setUpdateChecking(true);
    try {
      await api.update("check");
      const nextHealth = await api.health();
      setHealth(nextHealth);
      if (options.showMessage) {
        setMessage(
          nextHealth.update.status === "failed"
            ? "Update check failed. See the updater message below."
            : "Update check complete."
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update check failed");
    } finally {
      setUpdateChecking(false);
    }
  }

  async function applyUpdate() {
    setError("");
    setUpdateApplying(true);
    try {
      await api.update("apply");
      await api.health().then(setHealth).catch(() => {
        // The updater may restart the API before this immediate refresh completes.
      });
      setMessage("Update apply started. The app will keep checking while the service restarts.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply update failed");
      setUpdateApplying(false);
    }
  }

  const isContainerDeployment = health?.deployment.mode === "container";
  const isApplianceDeployment = health?.deployment.mode === "appliance";
  const canCheckUpdates = isApplianceDeployment || (isContainerDeployment && updateSettingsReady(update));

  return (
    <main>
      <section className="page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Connections and deployment controls</h1>
          <p className="muted">Secrets are encrypted locally. Home Assistant access remains read-only in v1.</p>
        </div>
      </section>
      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="settings-grid">
        <form className="panel" onSubmit={saveHa}>
          <h2>Home Assistant</h2>
          <label>
            URL
            <input
              placeholder="http://homeassistant.local:8123"
              value={ha.baseUrl}
              onChange={(event) => setHa({ ...ha, baseUrl: event.target.value })}
            />
          </label>
          <label>
            Long-Lived Access Token {ha.tokenConfigured ? "(configured)" : ""}
            <input
              type="password"
              value={haToken}
              onChange={(event) => setHaToken(event.target.value)}
              placeholder={ha.tokenConfigured ? "Leave blank to keep existing token" : "Paste token"}
            />
          </label>
          <label>
            Excluded domains
            <input
              value={ha.excludedDomains.join(", ")}
              onChange={(event) =>
                setHa({ ...ha, excludedDomains: splitList(event.target.value) })
              }
            />
          </label>
          <label>
            Excluded entities
            <input
              value={ha.excludedEntities.join(", ")}
              onChange={(event) =>
                setHa({ ...ha, excludedEntities: splitList(event.target.value) })
              }
            />
          </label>
          <div className="button-row">
            <button>Save HA settings</button>
            <button type="button" className="secondary" onClick={testHa}>Test connection</button>
          </div>
        </form>

        <section className="panel">
          <div className="panel-heading">
            <h2>System</h2>
            <span className="status-badge neutral">{deploymentLabel(health)}</span>
          </div>
          <p>Version: {health?.version ?? "unknown"}</p>
          <p>Database: {health?.databasePath ?? "unknown"}</p>
          <p>
            Active listener: {health?.network.protocol ?? "http"}://{health?.network.host ?? "0.0.0.0"}:
            {health?.network.port ?? runtime.httpPort}
          </p>
          <p>Deployment: {health?.deployment.mode ?? "unknown"}</p>
          <p className="muted">
            {health?.deployment.mode === "container"
              ? "The app is running in a container. Updates should be applied by replacing the image or upgrading the Helm release."
              : "The API service is managed by systemd and stores local data on this Pi."}
          </p>
        </section>

        {isContainerDeployment ? (
          <ContainerNetworkPanel health={health} runtime={runtime} />
        ) : isApplianceDeployment ? (
          <form className="panel" onSubmit={saveRuntime}>
            <div className="panel-heading">
              <h2>Network & TLS</h2>
              <TlsBadge runtime={runtime} />
            </div>
            <p className="muted">
              Port 8787 is the unprivileged default. Use 80/443 on the Pi, or map container ports externally.
            </p>
            <div className="two-col">
              <label>
                HTTP port
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={runtime.httpPort}
                  onChange={(event) => setRuntime({ ...runtime, httpPort: Number(event.target.value) })}
                />
              </label>
              <label>
                HTTPS port
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={runtime.httpsPort}
                  onChange={(event) => setRuntime({ ...runtime, httpsPort: Number(event.target.value) })}
                />
              </label>
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={runtime.httpsEnabled}
                onChange={(event) => setRuntime({ ...runtime, httpsEnabled: event.target.checked })}
              />
              Serve the app with HTTPS when a certificate is ready
            </label>
            <div className="field-group">
              <h3>SSL certificate</h3>
              <label>
                Hostname
                <input
                  placeholder="haai.example.com"
                  value={runtime.ssl.hostname}
                  onChange={(event) =>
                    setRuntime({ ...runtime, ssl: { ...runtime.ssl, hostname: event.target.value } })
                  }
                />
              </label>
              <label>
                DNS provider
                <select
                  value={runtime.ssl.dnsProvider}
                  onChange={(event) =>
                    setRuntime({
                      ...runtime,
                      ssl: { ...runtime.ssl, dnsProvider: event.target.value as RuntimeSettings["ssl"]["dnsProvider"] }
                    })
                  }
                >
                  <option value="cloudflare">Cloudflare</option>
                </select>
              </label>
              <label>
                Token {runtime.ssl.dnsTokenConfigured ? "(configured)" : ""}
                <input
                  type="password"
                  value={cloudflareToken}
                  onChange={(event) => setCloudflareToken(event.target.value)}
                  placeholder={runtime.ssl.dnsTokenConfigured ? "Leave blank to keep existing token" : "Paste Cloudflare token"}
                />
              </label>
              <div className="cert-status">
                <span>Status: {formatCertStatus(runtime.ssl.status)}</span>
                {runtime.ssl.requestedAt ? <span>Started: {new Date(runtime.ssl.requestedAt).toLocaleString()}</span> : null}
                {runtime.ssl.expiresAt ? <span>Expires: {new Date(runtime.ssl.expiresAt).toLocaleDateString()}</span> : null}
              </div>
              {runtime.ssl.error ? <p className="error">{runtime.ssl.error}</p> : null}
            </div>
            {runtime.restartRequired ? (
              <p className="muted">A service restart is required before saved listener changes take effect.</p>
            ) : null}
            {runtime.ssl.status === "requesting" ? (
              <p className="muted">Do not restart the service while certificate validation is running.</p>
            ) : null}
            <div className="button-row">
              <button>Save network settings</button>
              <button
                type="button"
                className="secondary"
                onClick={requestCertificate}
                disabled={certificateRequesting || runtime.ssl.status === "requesting" || !runtime.ssl.hostname}
              >
                {certificateRequesting ? "Requesting..." : "Request certificate"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={resetCertificate}
                disabled={!["requesting", "failed"].includes(runtime.ssl.status)}
              >
                Reset certificate status
              </button>
              <button
                type="button"
                className="secondary"
                onClick={renewCertificate}
                disabled={certificateRequesting || runtime.ssl.status !== "ready"}
              >
                Renew certificate now
              </button>
              <button
                type="button"
                className="secondary"
                onClick={restartService}
                disabled={restarting || runtime.ssl.status === "requesting"}
              >
                {restarting ? "Restarting..." : "Restart service"}
              </button>
            </div>
          </form>
        ) : (
          <section className="panel">
            <div className="panel-heading">
              <h2>Network & TLS</h2>
              <span className="status-badge neutral">Loading</span>
            </div>
            <p className="muted">Loading deployment controls...</p>
          </section>
        )}

        <section className="panel">
          <div className="panel-heading">
            <h2>Updates</h2>
            <UpdateBadge health={health} checking={updateChecking} applying={updateApplying} />
          </div>
          <div className="version-grid">
            <div>
              <span>Installed</span>
              <strong>{health?.version ?? "unknown"}</strong>
            </div>
            <div>
              <span>Latest</span>
              <strong>{health?.update.availableVersion ?? "unknown"}</strong>
            </div>
          </div>
          <p>Updater: {updateChecking ? "checking" : health?.update.status ?? "idle"}</p>
          {health?.update.checkedAt ? (
            <p className="muted">Last checked: {new Date(health.update.checkedAt).toLocaleString()}</p>
          ) : (
            <p className="muted">Last checked: never</p>
          )}
          {health?.update.error ? <p className="error">{health.update.error}</p> : null}
          <UpdateProgress health={health} checking={updateChecking} applying={updateApplying} />
          <ReleaseNotes health={health} />
          <UpdateInstructions health={health} />
          <div className="button-row">
            {canCheckUpdates ? (
              <button type="button" onClick={checkUpdate} disabled={updateChecking || updateApplying}>
                {updateChecking ? "Checking..." : "Check for updates"}
              </button>
            ) : null}
            {health?.deployment.updateApplySupported ? (
              <button
                type="button"
                className="secondary"
                onClick={applyUpdate}
                disabled={updateChecking || updateApplying || health?.update.status !== "available"}
              >
                {updateApplying ? "Applying..." : "Apply update"}
              </button>
            ) : null}
            {isApplianceDeployment ? (
              <button type="button" className="secondary" onClick={() => setUpdateSettingsOpen(true)}>
                Update settings
              </button>
            ) : null}
          </div>
        </section>
      </div>
      {updateSettingsOpen && isApplianceDeployment ? (
        <UpdateSettingsModal
          update={update}
          githubToken={githubToken}
          setUpdate={setUpdate}
          setGithubToken={setGithubToken}
          onClose={() => setUpdateSettingsOpen(false)}
          onSave={saveUpdate}
        />
      ) : null}
    </main>
  );
}

function deploymentLabel(health: SystemHealth | null): string {
  if (health?.deployment.mode === "container") return "Container";
  if (health?.deployment.mode === "appliance") return "Appliance";
  return "Local service";
}

function ContainerNetworkPanel({
  health,
  runtime
}: {
  health: SystemHealth | null;
  runtime: RuntimeSettings;
}) {
  const listener = `${health?.network.protocol ?? "http"}://${health?.network.host ?? "0.0.0.0"}:${
    health?.network.port ?? runtime.httpPort
  }`;

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Network & TLS</h2>
        <span className="status-badge neutral">Platform managed</span>
      </div>
      <p className="muted">
        This container listens inside the container. External ports, HTTPS, certificates, and restarts are managed by
        Docker, Rancher/Kubernetes Ingress, a reverse proxy, load balancer, or Cloudflare Tunnel.
      </p>
      <div className="version-grid">
        <div>
          <span>Active listener</span>
          <strong>{listener}</strong>
        </div>
        <div>
          <span>Container port</span>
          <strong>8787</strong>
        </div>
      </div>
      <ol className="instruction-list">
        <li>Map host ports in Docker or expose the Service through Kubernetes/Rancher.</li>
        <li>Terminate HTTPS at your proxy, Ingress, Gateway, load balancer, or tunnel.</li>
        <li>Restart or redeploy through the container platform rather than from inside HAAI.</li>
      </ol>
    </section>
  );
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function updateSettingsReady(settings: UpdateSettings): boolean {
  if (settings.source === "github") {
    return Boolean(settings.githubOwner && settings.githubRepo && settings.githubTokenConfigured);
  }
  return Boolean(settings.manifestUrl);
}

function versionsMatch(left: string, right?: string): boolean {
  return normalizeVersion(left) === normalizeVersion(right ?? "");
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, "");
}

function runtimeSettingsPayload(runtime: RuntimeSettings, cloudflareToken: string) {
  return {
    httpPort: runtime.httpPort,
    httpsPort: runtime.httpsPort,
    httpsEnabled: runtime.httpsEnabled,
    ssl: {
      hostname: runtime.ssl.hostname,
      dnsProvider: runtime.ssl.dnsProvider,
      token: cloudflareToken || undefined
    }
  };
}

function TlsBadge({ runtime }: { runtime: RuntimeSettings }) {
  if (runtime.ssl.status === "failed") return <span className="status-badge danger">Certificate failed</span>;
  if (runtime.ssl.status === "requesting") return <span className="status-badge info">Requesting</span>;
  if (runtime.httpsEnabled && runtime.ssl.status === "ready") {
    return <span className="status-badge success">HTTPS ready</span>;
  }
  if (runtime.ssl.status === "ready") return <span className="status-badge warning">Restart required</span>;
  return <span className="status-badge neutral">HTTP active</span>;
}

function formatCertStatus(status: RuntimeSettings["ssl"]["status"]): string {
  return status.replace("_", " ");
}

function UpdateBadge({
  health,
  checking,
  applying
}: {
  health: SystemHealth | null;
  checking: boolean;
  applying: boolean;
}) {
  const state = getUpdateBadgeState(health, checking, applying);
  return <span className={`status-badge ${state.tone}`}>{state.label}</span>;
}

function getUpdateBadgeState(health: SystemHealth | null, checking: boolean, applying: boolean) {
  if (checking) return { label: "Checking", tone: "info" };
  if (applying || health?.update.status === "applying") return { label: "Applying", tone: "info" };
  const update = health?.update;
  if (!update?.checkedAt) return { label: "Not checked", tone: "neutral" };
  if (update.status === "failed") return { label: "Check failed", tone: "danger" };
  if (update.status === "available") return { label: "Update available", tone: "warning" };
  if (update.status === "applying") return { label: "Applying", tone: "info" };
  return { label: "Up to date", tone: "success" };
}

function UpdateProgress({
  health,
  checking,
  applying
}: {
  health: SystemHealth | null;
  checking: boolean;
  applying: boolean;
}) {
  const progress = checking
    ? { label: "Checking for updates", percent: 35 }
    : applying && health?.update.status !== "applying"
      ? { label: "Applying update", percent: 10 }
      : health?.update.progress;
  if (!progress && health?.update.status !== "available") return null;

  const percent = progress?.percent ?? 100;
  const label =
    progress?.label ??
    (health?.update.status === "available" ? "Update is ready to install" : "Waiting");

  return (
    <div className="update-progress">
      <div className="progress-label">
        <span>{label}</span>
        <span>{percent}%</span>
      </div>
      <div className="progress-track" aria-label={label}>
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function ReleaseNotes({ health }: { health: SystemHealth | null }) {
  const update = health?.update;
  if (!update?.availableVersion && !update?.releaseNotes && !update?.releaseUrl) return null;

  return (
    <section className="release-notes">
      <div className="panel-heading">
        <h3>Release notes</h3>
        {update.releaseUrl ? (
          <a href={update.releaseUrl} target="_blank" rel="noreferrer">
            View on GitHub
          </a>
        ) : null}
      </div>
      <p className="muted">
        {update.archiveName ? `Asset: ${update.archiveName}` : "Release asset details unavailable"}
      </p>
      <pre className="notes-box">
        {update.releaseNotes?.trim() || "No release notes were provided for this release."}
      </pre>
    </section>
  );
}

function UpdateInstructions({ health }: { health: SystemHealth | null }) {
  if (health?.deployment.updateApplySupported) return null;
  const instructions = health?.update.updateInstructions ?? [
    "Docker Compose: update the image tag, then run docker compose pull && docker compose up -d --remove-orphans.",
    "Kubernetes/Rancher: upgrade the Helm chart and image tag to the desired version.",
    "Keep /data persistent so SQLite state, settings, secrets, certificates, logs, and history are retained."
  ];

  return (
    <section className="release-notes">
      <div className="panel-heading">
        <h3>Container update instructions</h3>
      </div>
      <p className="muted">
        This deployment cannot be updated from inside the app. Use your container platform to replace the running image.
      </p>
      <ol className="instruction-list">
        {instructions.map((instruction) => (
          <li key={instruction}>{instruction}</li>
        ))}
      </ol>
    </section>
  );
}

function UpdateSettingsModal({
  update,
  githubToken,
  setUpdate,
  setGithubToken,
  onClose,
  onSave
}: {
  update: UpdateSettings;
  githubToken: string;
  setUpdate: (settings: UpdateSettings) => void;
  setGithubToken: (token: string) => void;
  onClose: () => void;
  onSave: (event: FormEvent) => Promise<void>;
}) {
  async function submit(event: FormEvent) {
    await onSave(event);
    onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="modal"
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Updates</p>
            <h2 id="update-settings-title">Update settings</h2>
          </div>
          <button type="button" className="ghost icon-button" onClick={onClose} aria-label="Close update settings">
            x
          </button>
        </div>
        <label>
          Update source
          <select
            value={update.source}
            onChange={(event) =>
              setUpdate({ ...update, source: event.target.value as UpdateSettings["source"] })
            }
          >
            <option value="github">Private GitHub release</option>
            <option value="manifest">Manifest fallback</option>
          </select>
        </label>
        {update.source === "github" ? (
          <>
            <div className="two-col">
              <label>
                GitHub owner
                <input
                  placeholder="roach0816"
                  value={update.githubOwner}
                  onChange={(event) => setUpdate({ ...update, githubOwner: event.target.value })}
                />
              </label>
              <label>
                GitHub repo
                <input
                  placeholder="haai"
                  value={update.githubRepo}
                  onChange={(event) => setUpdate({ ...update, githubRepo: event.target.value })}
                />
              </label>
            </div>
            <label>
              GitHub token {update.githubTokenConfigured ? "(configured)" : ""}
              <input
                type="password"
                value={githubToken}
                onChange={(event) => setGithubToken(event.target.value)}
                placeholder={update.githubTokenConfigured ? "Leave blank to keep existing token" : "Paste fine-grained token"}
              />
            </label>
          </>
        ) : (
          <label>
            Manifest URL
            <input
              placeholder="http://nas.local/haai/latest.json"
              value={update.manifestUrl}
              onChange={(event) => setUpdate({ ...update, manifestUrl: event.target.value })}
            />
          </label>
        )}
        <footer className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button>Save settings</button>
        </footer>
      </form>
    </div>
  );
}
