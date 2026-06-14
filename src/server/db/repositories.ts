import bcrypt from "bcryptjs";
import type {
  AiSettings,
  AnalysisRun,
  HaSnapshot,
  HomeAssistantSettings,
  RuntimeSettings,
  Suggestion,
  UpdateSettings
} from "../../shared/types.js";
import { createId, decryptSecret, encryptSecret, hmac } from "../crypto.js";
import { getDb, getSetting, nowIso, setSetting } from "./database.js";

const defaultHaSettings: HomeAssistantSettings & { token?: string } = {
  baseUrl: "",
  tokenConfigured: false,
  verifyTls: true,
  excludedDomains: ["person", "zone"],
  excludedEntities: []
};

const defaultAiSettings: AiSettings & { apiKey?: string } = {
  provider: "openai",
  model: "gpt-4.1-mini",
  apiKeyConfigured: false,
  maxTokensPerRun: 12000,
  monthlyBudgetUsd: 20,
  scheduleCron: "0 3 * * *",
  enabled: true
};

const defaultUpdateSettings: UpdateSettings & { githubToken?: string } = {
  source: "github",
  githubOwner: "",
  githubRepo: "",
  githubTokenConfigured: false,
  manifestUrl: ""
};

const defaultRuntimeSettings: RuntimeSettings & { cloudflareToken?: string } = {
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
};

export function hasAdminUser(): boolean {
  const row = getDb().prepare("SELECT id FROM users LIMIT 1").get();
  return Boolean(row);
}

export async function createAdminUser(username: string, password: string): Promise<void> {
  if (hasAdminUser()) throw new Error("Admin user already exists");
  const passwordHash = await bcrypt.hash(password, 12);
  getDb()
    .prepare("INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .run(createId("usr"), username, passwordHash, nowIso());
}

export async function authenticate(username: string, password: string): Promise<string | null> {
  const user = getDb()
    .prepare("SELECT id, password_hash FROM users WHERE username = ?")
    .get(username) as { id: string; password_hash: string } | undefined;
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;
  return user.id;
}

export function createSession(userId: string): string {
  const token = createId("sess");
  const sessionId = createId("sid");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  getDb()
    .prepare(
      "INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(sessionId, userId, hmac(token), expiresAt, nowIso());
  return token;
}

export function findSessionUser(token?: string): string | null {
  if (!token) return null;
  const row = getDb()
    .prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?")
    .get(hmac(token)) as { user_id: string; expires_at: string } | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.user_id;
}

export function deleteSession(token?: string): void {
  if (!token) return;
  getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hmac(token));
}

export function getHomeAssistantSettings(includeToken = false) {
  const stored = getSetting<typeof defaultHaSettings>("homeAssistant", defaultHaSettings);
  const token = stored.token ? decryptSecret(stored.token) : "";
  return {
    ...stored,
    token: includeToken ? token : undefined,
    tokenConfigured: Boolean(stored.token)
  };
}

export function saveHomeAssistantSettings(input: {
  baseUrl: string;
  token?: string;
  verifyTls: boolean;
  excludedDomains: string[];
  excludedEntities: string[];
}): HomeAssistantSettings {
  const current = getSetting<typeof defaultHaSettings>("homeAssistant", defaultHaSettings);
  const stored = {
    ...current,
    baseUrl: input.baseUrl.replace(/\/$/, ""),
    verifyTls: input.verifyTls,
    excludedDomains: input.excludedDomains,
    excludedEntities: input.excludedEntities,
    token: input.token ? encryptSecret(input.token) : current.token,
    tokenConfigured: Boolean(input.token || current.token)
  };
  setSetting("homeAssistant", stored);
  return getHomeAssistantSettings(false);
}

export function getAiSettings(includeKey = false) {
  const stored = getSetting<typeof defaultAiSettings>("ai", defaultAiSettings);
  const apiKey = stored.apiKey ? decryptSecret(stored.apiKey) : "";
  return {
    ...stored,
    apiKey: includeKey ? apiKey : undefined,
    apiKeyConfigured: Boolean(stored.apiKey)
  };
}

export function saveAiSettings(input: {
  provider: AiSettings["provider"];
  model: string;
  apiKey?: string;
  maxTokensPerRun: number;
  monthlyBudgetUsd: number;
  scheduleCron: string;
  enabled: boolean;
}): AiSettings {
  const current = getSetting<typeof defaultAiSettings>("ai", defaultAiSettings);
  const stored = {
    ...current,
    ...input,
    apiKey: input.apiKey ? encryptSecret(input.apiKey) : current.apiKey,
    apiKeyConfigured: Boolean(input.apiKey || current.apiKey)
  };
  setSetting("ai", stored);
  return getAiSettings(false);
}

export function getUpdateSettings(includeToken = false) {
  const stored = getSetting<typeof defaultUpdateSettings>("update", defaultUpdateSettings);
  const githubToken = stored.githubToken ? decryptSecret(stored.githubToken) : "";
  return {
    ...stored,
    githubToken: includeToken ? githubToken : undefined,
    githubTokenConfigured: Boolean(stored.githubToken)
  };
}

export function saveUpdateSettings(input: {
  source: UpdateSettings["source"];
  githubOwner: string;
  githubRepo: string;
  githubToken?: string;
  manifestUrl: string;
}): UpdateSettings {
  const current = getSetting<typeof defaultUpdateSettings>("update", defaultUpdateSettings);
  const stored = {
    ...current,
    source: input.source,
    githubOwner: input.githubOwner.trim(),
    githubRepo: input.githubRepo.trim(),
    manifestUrl: input.manifestUrl.trim(),
    githubToken: input.githubToken ? encryptSecret(input.githubToken) : current.githubToken,
    githubTokenConfigured: Boolean(input.githubToken || current.githubToken)
  };
  setSetting("update", stored);
  return getUpdateSettings(false);
}

export function getRuntimeSettings(includeToken = false) {
  const stored = getSetting<typeof defaultRuntimeSettings>("runtime", defaultRuntimeSettings);
  const cloudflareToken = stored.cloudflareToken ? decryptSecret(stored.cloudflareToken) : "";
  return {
    ...stored,
    cloudflareToken: includeToken ? cloudflareToken : undefined,
    restartRequired: Boolean(stored.restartRequired),
    ssl: {
      ...stored.ssl,
      dnsTokenConfigured: Boolean(stored.cloudflareToken)
    }
  };
}

export function saveRuntimeSettings(input: {
  httpPort: number;
  httpsPort: number;
  httpsEnabled: boolean;
  ssl: {
    hostname: string;
    dnsProvider: RuntimeSettings["ssl"]["dnsProvider"];
    token?: string;
  };
}): RuntimeSettings {
  const current = getSetting<typeof defaultRuntimeSettings>("runtime", defaultRuntimeSettings);
  const cloudflareToken = input.ssl.token?.trim();
  const stored = {
    ...current,
    httpPort: input.httpPort,
    httpsPort: input.httpsPort,
    httpsEnabled: input.httpsEnabled,
    restartRequired: true,
    cloudflareToken: cloudflareToken ? encryptSecret(cloudflareToken) : current.cloudflareToken,
    ssl: {
      ...current.ssl,
      hostname: input.ssl.hostname.trim().toLowerCase(),
      dnsProvider: input.ssl.dnsProvider,
      dnsTokenConfigured: Boolean(cloudflareToken || current.cloudflareToken)
    }
  };
  setSetting("runtime", stored);
  return getRuntimeSettings(false);
}

export function saveCertificateResult(input: {
  status: RuntimeSettings["ssl"]["status"];
  issuedAt?: string;
  expiresAt?: string;
  error?: string;
}): RuntimeSettings {
  const current = getSetting<typeof defaultRuntimeSettings>("runtime", defaultRuntimeSettings);
  const stored = {
    ...current,
    restartRequired: input.status === "ready" ? true : current.restartRequired,
    ssl: {
      ...current.ssl,
      status: input.status,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      error: input.error
    }
  };
  setSetting("runtime", stored);
  return getRuntimeSettings(false);
}

export function clearRuntimeRestartRequired(): RuntimeSettings {
  const current = getSetting<typeof defaultRuntimeSettings>("runtime", defaultRuntimeSettings);
  setSetting("runtime", { ...current, restartRequired: false });
  return getRuntimeSettings(false);
}

export function saveSnapshot(snapshot: HaSnapshot): string {
  const id = createId("snap");
  getDb()
    .prepare("INSERT INTO snapshots (id, captured_at, payload) VALUES (?, ?, ?)")
    .run(id, snapshot.capturedAt, JSON.stringify(snapshot));
  return id;
}

export function getSnapshot(id: string): HaSnapshot | null {
  const row = getDb().prepare("SELECT payload FROM snapshots WHERE id = ?").get(id) as
    | { payload: string }
    | undefined;
  return row ? (JSON.parse(row.payload) as HaSnapshot) : null;
}

export function createAnalysisRun(trigger: AnalysisRun["trigger"], snapshotId?: string): AnalysisRun {
  const run: AnalysisRun = {
    id: createId("run"),
    status: "running",
    trigger,
    startedAt: nowIso(),
    suggestionCount: 0
  };
  getDb()
    .prepare(
      "INSERT INTO analysis_runs (id, status, trigger, snapshot_id, started_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(run.id, run.status, trigger, snapshotId ?? null, run.startedAt);
  return run;
}

export function completeAnalysisRun(id: string, summary: string): void {
  getDb()
    .prepare("UPDATE analysis_runs SET status = 'completed', completed_at = ?, summary = ? WHERE id = ?")
    .run(nowIso(), summary, id);
}

export function failAnalysisRun(id: string, error: string): void {
  getDb()
    .prepare("UPDATE analysis_runs SET status = 'failed', completed_at = ?, error = ? WHERE id = ?")
    .run(nowIso(), error, id);
}

export function listAnalysisRuns(): AnalysisRun[] {
  const rows = getDb()
    .prepare(
      `SELECT r.*, COUNT(s.id) AS suggestion_count
       FROM analysis_runs r
       LEFT JOIN suggestions s ON s.run_id = r.id
       GROUP BY r.id
       ORDER BY r.started_at DESC
       LIMIT 50`
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map(mapRun);
}

export function latestRun(): AnalysisRun | undefined {
  return listAnalysisRuns()[0];
}

export function saveSuggestions(runId: string, suggestions: Omit<Suggestion, "id" | "runId" | "status" | "createdAt">[]): Suggestion[] {
  const created: Suggestion[] = suggestions.map((suggestion) => ({
    ...suggestion,
    id: createId("sug"),
    runId,
    status: "new",
    createdAt: nowIso()
  }));
  const insert = getDb().prepare(
    `INSERT INTO suggestions
     (id, run_id, category, title, rationale, confidence, effort, risk, evidence, yaml, install_steps, rollback_steps, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const trx = getDb().transaction((items: Suggestion[]) => {
    for (const item of items) {
      insert.run(
        item.id,
        item.runId,
        item.category,
        item.title,
        item.rationale,
        item.confidence,
        item.effort,
        item.risk,
        JSON.stringify(item.evidence),
        item.yaml,
        JSON.stringify(item.installSteps),
        JSON.stringify(item.rollbackSteps),
        item.status,
        item.createdAt
      );
    }
  });
  trx(created);
  return created;
}

export function listSuggestions(filters: { category?: string; status?: string }): Suggestion[] {
  const clauses: string[] = [];
  const params: string[] = [];
  if (filters.category) {
    clauses.push("category = ?");
    params.push(filters.category);
  }
  if (filters.status) {
    clauses.push("status = ?");
    params.push(filters.status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = getDb()
    .prepare(`SELECT * FROM suggestions ${where} ORDER BY created_at DESC`)
    .all(...params) as Array<Record<string, unknown>>;
  return rows.map(mapSuggestion);
}

export function updateSuggestionStatus(id: string, status: Suggestion["status"]): Suggestion | null {
  getDb().prepare("UPDATE suggestions SET status = ? WHERE id = ?").run(status, id);
  const row = getDb().prepare("SELECT * FROM suggestions WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapSuggestion(row) : null;
}

function mapRun(row: Record<string, unknown>): AnalysisRun {
  return {
    id: String(row.id),
    status: row.status as AnalysisRun["status"],
    trigger: row.trigger as AnalysisRun["trigger"],
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    summary: row.summary ? String(row.summary) : undefined,
    error: row.error ? String(row.error) : undefined,
    suggestionCount: Number(row.suggestion_count ?? 0)
  };
}

function mapSuggestion(row: Record<string, unknown>): Suggestion {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    category: row.category as Suggestion["category"],
    title: String(row.title),
    rationale: String(row.rationale),
    confidence: Number(row.confidence),
    effort: row.effort as Suggestion["effort"],
    risk: row.risk as Suggestion["risk"],
    evidence: JSON.parse(String(row.evidence)),
    yaml: String(row.yaml),
    installSteps: JSON.parse(String(row.install_steps)),
    rollbackSteps: JSON.parse(String(row.rollback_steps)),
    status: row.status as Suggestion["status"],
    createdAt: String(row.created_at)
  };
}
