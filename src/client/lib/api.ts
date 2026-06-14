import type {
  AiSettings,
  AnalysisRun,
  HomeAssistantSettings,
  RuntimeSettings,
  Suggestion,
  SystemHealth,
  UpdateSettings
} from "../../shared/types";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

export const api = {
  health: () => request<SystemHealth>("/api/system/health"),
  me: () => request<{ setupComplete: boolean; authenticated: boolean }>("/api/auth/me"),
  setup: (body: { username: string; password: string }) =>
    request<{ authenticated: boolean }>("/api/auth/setup", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  login: (body: { username: string; password: string }) =>
    request<{ authenticated: boolean }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  logout: () => request<{ authenticated: boolean }>("/api/auth/logout", { method: "POST" }),
  getHomeAssistantSettings: () =>
    request<HomeAssistantSettings>("/api/settings/home-assistant"),
  saveHomeAssistantSettings: (
    body: Omit<HomeAssistantSettings, "tokenConfigured"> & { token?: string }
  ) =>
    request<HomeAssistantSettings>("/api/settings/home-assistant", {
      method: "PUT",
      body: JSON.stringify(body)
    }),
  testHomeAssistant: () =>
    request<{ rest: boolean; websocket: boolean; version?: string; message: string }>(
      "/api/home-assistant/test",
      { method: "POST" }
    ),
  getAiSettings: () => request<AiSettings>("/api/settings/ai-provider"),
  saveAiSettings: (body: Omit<AiSettings, "apiKeyConfigured"> & { apiKey?: string }) =>
    request<AiSettings>("/api/settings/ai-provider", {
      method: "PUT",
      body: JSON.stringify(body)
    }),
  getUpdateSettings: () => request<UpdateSettings>("/api/settings/update"),
  saveUpdateSettings: (
    body: Omit<UpdateSettings, "githubTokenConfigured"> & { githubToken?: string }
  ) =>
    request<UpdateSettings>("/api/settings/update", {
      method: "PUT",
      body: JSON.stringify(body)
    }),
  getRuntimeSettings: () => request<RuntimeSettings>("/api/settings/runtime"),
  saveRuntimeSettings: (
    body: Omit<RuntimeSettings, "restartRequired" | "ssl"> & {
      ssl: Pick<RuntimeSettings["ssl"], "hostname" | "dnsProvider"> & { token?: string };
    }
  ) =>
    request<RuntimeSettings>("/api/settings/runtime", {
      method: "PUT",
      body: JSON.stringify(body)
    }),
  requestCertificate: () =>
    request<RuntimeSettings>("/api/settings/runtime/certificate", {
      method: "POST"
    }),
  restartService: () => request<{ restarting: boolean }>("/api/system/restart", { method: "POST" }),
  startAnalysis: () =>
    request<{ runId: string }>("/api/analysis-runs", {
      method: "POST"
    }),
  listRuns: () => request<AnalysisRun[]>("/api/analysis-runs"),
  listSuggestions: (params: URLSearchParams) =>
    request<Suggestion[]>(`/api/suggestions?${params.toString()}`),
  updateSuggestion: (id: string, status: Suggestion["status"]) =>
    request<Suggestion>(`/api/suggestions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    }),
  regenerateSuggestion: (id: string) =>
    request<{ runId: string }>(`/api/suggestions/${id}/regenerate`, {
      method: "POST"
    }),
  update: (action: "check" | "apply") =>
    request<Record<string, unknown>>("/api/system/update", {
      method: "POST",
      body: JSON.stringify({ action })
    })
};
