import { FormEvent, useEffect, useRef, useState } from "react";
import type { AiSettings, HomeAssistantSettings, SystemHealth, UpdateSettings } from "../../shared/types";
import { api } from "../lib/api";

const providerModels = {
  openai: "gpt-4.1-mini",
  anthropic: "claude-3-5-sonnet-latest",
  gemini: "gemini-1.5-pro"
};

export function Settings() {
  const [ha, setHa] = useState<HomeAssistantSettings>({
    baseUrl: "",
    tokenConfigured: false,
    verifyTls: true,
    excludedDomains: [],
    excludedEntities: []
  });
  const [ai, setAi] = useState<AiSettings>({
    provider: "openai",
    model: providerModels.openai,
    apiKeyConfigured: false,
    maxTokensPerRun: 12000,
    monthlyBudgetUsd: 20,
    scheduleCron: "0 3 * * *",
    enabled: true
  });
  const [haToken, setHaToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [update, setUpdate] = useState<UpdateSettings>({
    source: "github",
    githubOwner: "",
    githubRepo: "",
    githubTokenConfigured: false,
    manifestUrl: ""
  });
  const [githubToken, setGithubToken] = useState("");
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateSettingsOpen, setUpdateSettingsOpen] = useState(false);
  const autoUpdateCheckStarted = useRef(false);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      api.getHomeAssistantSettings(),
      api.getAiSettings(),
      api.getUpdateSettings(),
      api.health()
    ]).then(
      ([haSettings, aiSettings, updateSettings, healthState]) => {
        if (cancelled) return;
        setHa(haSettings);
        setAi(aiSettings);
        setUpdate(updateSettings);
        setHealth(healthState);
        if (!autoUpdateCheckStarted.current && updateSettingsReady(updateSettings)) {
          autoUpdateCheckStarted.current = true;
          void runUpdateCheck({ showMessage: false });
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (health?.update.status !== "applying") return;
    const timer = window.setInterval(() => {
      void api.health()
        .then(setHealth)
        .catch(() => {
          // The API may briefly restart during install; keep polling.
        });
    }, 2500);
    return () => window.clearInterval(timer);
  }, [health?.update.status]);

  async function saveHa(event: FormEvent) {
    event.preventDefault();
    setError("");
    const saved = await api.saveHomeAssistantSettings({ ...ha, token: haToken || undefined });
    setHa(saved);
    setHaToken("");
    setMessage("Home Assistant settings saved.");
  }

  async function saveAi(event: FormEvent) {
    event.preventDefault();
    setError("");
    const saved = await api.saveAiSettings({ ...ai, apiKey: apiKey || undefined });
    setAi(saved);
    setApiKey("");
    setMessage("AI settings saved.");
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
    setUpdateChecking(true);
    try {
      await api.update("apply");
      setHealth(await api.health());
      setMessage("Update apply started. Refresh after the service restarts.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply update failed");
    } finally {
      setUpdateChecking(false);
    }
  }

  return (
    <main>
      <section className="page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Connections and appliance controls</h1>
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

        <form className="panel" onSubmit={saveAi}>
          <h2>AI provider</h2>
          <label>
            Provider
            <select
              value={ai.provider}
              onChange={(event) => {
                const provider = event.target.value as AiSettings["provider"];
                setAi({ ...ai, provider, model: providerModels[provider] });
              }}
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Gemini</option>
            </select>
          </label>
          <label>
            Model
            <input value={ai.model} onChange={(event) => setAi({ ...ai, model: event.target.value })} />
          </label>
          <label>
            API key {ai.apiKeyConfigured ? "(configured)" : ""}
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={ai.apiKeyConfigured ? "Leave blank to keep existing key" : "Paste API key"}
            />
          </label>
          <div className="two-col">
            <label>
              Tokens/run
              <input
                type="number"
                value={ai.maxTokensPerRun}
                onChange={(event) => setAi({ ...ai, maxTokensPerRun: Number(event.target.value) })}
              />
            </label>
            <label>
              Monthly budget
              <input
                type="number"
                value={ai.monthlyBudgetUsd}
                onChange={(event) => setAi({ ...ai, monthlyBudgetUsd: Number(event.target.value) })}
              />
            </label>
          </div>
          <label>
            Daily cron
            <input value={ai.scheduleCron} onChange={(event) => setAi({ ...ai, scheduleCron: event.target.value })} />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={ai.enabled}
              onChange={(event) => setAi({ ...ai, enabled: event.target.checked })}
            />
            Enable scheduled analysis
          </label>
          <button>Save AI settings</button>
        </form>

        <section className="panel">
          <div className="panel-heading">
            <h2>Appliance</h2>
            <span className="status-badge neutral">Local service</span>
          </div>
          <p>Version: {health?.version ?? "unknown"}</p>
          <p>Database: {health?.databasePath ?? "unknown"}</p>
          <p className="muted">The API service is managed by systemd and stores local data on this Pi.</p>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Updates</h2>
            <UpdateBadge health={health} checking={updateChecking} />
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
          <UpdateProgress health={health} checking={updateChecking} />
          <ReleaseNotes health={health} />
          <div className="button-row">
            <button type="button" onClick={checkUpdate} disabled={updateChecking}>
              {updateChecking ? "Checking..." : "Check for updates"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={applyUpdate}
              disabled={updateChecking || health?.update.status !== "available"}
            >
              Apply update
            </button>
            <button type="button" className="secondary" onClick={() => setUpdateSettingsOpen(true)}>
              Update settings
            </button>
          </div>
        </section>
      </div>
      {updateSettingsOpen ? (
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

function UpdateBadge({ health, checking }: { health: SystemHealth | null; checking: boolean }) {
  const state = getUpdateBadgeState(health, checking);
  return <span className={`status-badge ${state.tone}`}>{state.label}</span>;
}

function getUpdateBadgeState(health: SystemHealth | null, checking: boolean) {
  if (checking) return { label: "Checking", tone: "info" };
  const update = health?.update;
  if (!update?.checkedAt) return { label: "Not checked", tone: "neutral" };
  if (update.status === "failed") return { label: "Check failed", tone: "danger" };
  if (update.status === "available") return { label: "Update available", tone: "warning" };
  if (update.status === "applying") return { label: "Applying", tone: "info" };
  return { label: "Up to date", tone: "success" };
}

function UpdateProgress({ health, checking }: { health: SystemHealth | null; checking: boolean }) {
  const progress = checking
    ? { label: "Checking for updates", percent: 35 }
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
