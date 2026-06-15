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
    promptTemplate: "",
    mcp: {
      enabled: false,
      serverLabel: "ha-mcp",
      serverUrl: "",
      serverDescription: "Home Assistant MCP server for read-only home context.",
      authorizationConfigured: false,
      allowedTools: []
    }
  });
  const [apiKey, setApiKey] = useState("");
  const [mcpAuthorization, setMcpAuthorization] = useState("");
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
      const saved = await api.saveAiSettings({
        ...ai,
        apiKey: apiKey || undefined,
        mcpAuthorization: mcpAuthorization || undefined
      });
      setAi(saved);
      setApiKey("");
      setMcpAuthorization("");
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
          <h1>Provider and suggestion guidance</h1>
          <p className="muted">Tune the AI provider, model, limits, schedule, and the type of suggestions HAAI should prioritize.</p>
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
                setAi({
                  ...ai,
                  provider,
                  model: providerModels[provider],
                  mcp: { ...ai.mcp, enabled: provider === "openai" ? ai.mcp.enabled : false }
                });
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
          Suggestion guidance
          <textarea
            className="prompt-editor"
            value={ai.promptTemplate}
            onChange={(event) => setAi({ ...ai, promptTemplate: event.target.value })}
          />
        </label>
        <p className="muted">
          This guidance shapes what the AI prioritizes, but HAAI always keeps the required JSON schema,
          categories, read-only behavior, and Home Assistant evidence rules under application control.
        </p>
        <section className="field-group">
          <h3>OpenAI MCP server</h3>
          <p className="muted">
            Use a remote MCP server with OpenAI Responses. The server must be reachable by OpenAI over HTTP/SSE or Streamable HTTP.
          </p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={ai.mcp.enabled}
              disabled={ai.provider !== "openai"}
              onChange={(event) => setAi({ ...ai, mcp: { ...ai.mcp, enabled: event.target.checked } })}
            />
            Enable MCP for OpenAI analysis
          </label>
          {ai.provider !== "openai" ? (
            <p className="muted">MCP support is currently wired only for OpenAI.</p>
          ) : null}
          <div className="two-col">
            <label>
              Server label
              <input
                value={ai.mcp.serverLabel}
                onChange={(event) => setAi({ ...ai, mcp: { ...ai.mcp, serverLabel: event.target.value } })}
              />
            </label>
            <label>
              Server URL
              <input
                placeholder="https://ha-mcp.example.com/mcp"
                value={ai.mcp.serverUrl}
                onChange={(event) => setAi({ ...ai, mcp: { ...ai.mcp, serverUrl: event.target.value } })}
              />
            </label>
          </div>
          <label>
            Description
            <input
              value={ai.mcp.serverDescription}
              onChange={(event) => setAi({ ...ai, mcp: { ...ai.mcp, serverDescription: event.target.value } })}
            />
          </label>
          <label>
            Authorization token {ai.mcp.authorizationConfigured ? "(configured)" : ""}
            <input
              type="password"
              value={mcpAuthorization}
              onChange={(event) => setMcpAuthorization(event.target.value)}
              placeholder={ai.mcp.authorizationConfigured ? "Leave blank to keep existing token" : "Optional bearer/OAuth token"}
            />
          </label>
          <label>
            Allowed tools
            <input
              value={ai.mcp.allowedTools.join(", ")}
              onChange={(event) =>
                setAi({ ...ai, mcp: { ...ai.mcp, allowedTools: splitList(event.target.value) } })
              }
              placeholder="Optional: get_states, get_history"
            />
          </label>
          <p className="muted">
            Leave allowed tools blank to expose every tool from the MCP server. For Home Assistant, prefer read-only tools.
            HAAI sends MCP requests with automatic approval because analysis runs can happen in the background.
          </p>
        </section>
        <button>Save AI configuration</button>
      </form>
    </main>
  );
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
