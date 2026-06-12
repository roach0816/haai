import { FormEvent, useEffect, useState } from "react";
import type { AiSettings, HomeAssistantSettings, SystemHealth } from "../../shared/types";
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
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([api.getHomeAssistantSettings(), api.getAiSettings(), api.health()]).then(
      ([haSettings, aiSettings, healthState]) => {
        setHa(haSettings);
        setAi(aiSettings);
        setHealth(healthState);
      }
    );
  }, []);

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

  async function checkUpdate() {
    await api.update("check");
    setHealth(await api.health());
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
          <h2>Appliance</h2>
          <p>Version: {health?.version ?? "unknown"}</p>
          <p>Database: {health?.databasePath ?? "unknown"}</p>
          <p>Updater: {health?.update.status ?? "idle"}</p>
          <div className="button-row">
            <button type="button" onClick={checkUpdate}>Check for updates</button>
            <button type="button" className="secondary" onClick={() => api.update("apply")}>Apply update</button>
          </div>
        </section>
      </div>
    </main>
  );
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
