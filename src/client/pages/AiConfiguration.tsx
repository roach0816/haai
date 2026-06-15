import { FormEvent, useEffect, useState } from "react";
import type { AiSettings } from "../../shared/types";
import { api } from "../lib/api";

const providerModels = {
  openai: "gpt-4.1-mini",
  anthropic: "claude-3-5-sonnet-latest",
  gemini: "gemini-1.5-pro"
};

export function AiConfiguration() {
  const [ai, setAi] = useState<AiSettings>({
    provider: "openai",
    model: providerModels.openai,
    apiKeyConfigured: false,
    maxTokensPerRun: 12000,
    monthlyBudgetUsd: 20,
    scheduleCron: "0 3 * * *",
    enabled: true,
    promptTemplate: ""
  });
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void api.getAiSettings()
      .then(setAi)
      .catch((err) => setError(err instanceof Error ? err.message : "AI settings failed to load"));
  }, []);

  async function saveAi(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const saved = await api.saveAiSettings({ ...ai, apiKey: apiKey || undefined });
      setAi(saved);
      setApiKey("");
      setMessage("AI configuration saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI configuration failed to save");
    }
  }

  return (
    <main>
      <section className="page-header">
        <div>
          <p className="eyebrow">AI Configuration</p>
          <h1>Provider and prompting</h1>
          <p className="muted">Tune the AI provider, model, limits, schedule, and the prompt used for Home Assistant analysis.</p>
        </div>
      </section>

      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <form className="panel" onSubmit={saveAi}>
        <div className="two-col">
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
        </div>
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
            Max tokens per run
            <input
              type="number"
              value={ai.maxTokensPerRun}
              onChange={(event) => setAi({ ...ai, maxTokensPerRun: Number(event.target.value) })}
            />
          </label>
          <label>
            Monthly budget USD
            <input
              type="number"
              value={ai.monthlyBudgetUsd}
              onChange={(event) => setAi({ ...ai, monthlyBudgetUsd: Number(event.target.value) })}
            />
          </label>
        </div>
        <label>
          Daily scan cron
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
        <label>
          Analysis prompt
          <textarea
            className="prompt-editor"
            value={ai.promptTemplate}
            onChange={(event) => setAi({ ...ai, promptTemplate: event.target.value })}
          />
        </label>
        <p className="muted">
          Available placeholders: <code>{"{{categories}}"}</code> and <code>{"{{maxSuggestions}}"}</code>. The app appends the Home Assistant snapshot after this prompt.
        </p>
        <button>Save AI configuration</button>
      </form>
    </main>
  );
}
