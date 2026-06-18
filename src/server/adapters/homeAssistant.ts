import WebSocket from "ws";
import type {
  HaErrorLogPattern,
  HaHistoryPattern,
  HaLogbookPattern,
  HaSnapshot,
  HaState
} from "../../shared/types.js";
import { addAppLog, getHomeAssistantSettings } from "../db/repositories.js";

interface HaCredentials {
  baseUrl: string;
  token: string;
  excludedDomains: string[];
  excludedEntities: string[];
}

export interface ConnectionTestResult {
  rest: boolean;
  websocket: boolean;
  version?: string;
  message: string;
}

class HomeAssistantApiError extends Error {
  constructor(
    public readonly path: string,
    public readonly status: number
  ) {
    super(`Home Assistant ${path} returned ${status}`);
  }
}

function credentials(): HaCredentials {
  const settings = getHomeAssistantSettings(true);
  if (!settings.baseUrl || !settings.token) {
    throw new Error("Home Assistant URL and token are required");
  }
  return {
    baseUrl: settings.baseUrl,
    token: settings.token,
    excludedDomains: settings.excludedDomains,
    excludedEntities: settings.excludedEntities
  };
}

async function haFetch<T>(path: string): Promise<T> {
  const { baseUrl, token } = credentials();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });
  if (!response.ok) {
    throw new HomeAssistantApiError(path, response.status);
  }
  return (await response.json()) as T;
}

async function haFetchText(path: string): Promise<string> {
  const { baseUrl, token } = credentials();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });
  if (!response.ok) {
    throw new HomeAssistantApiError(path, response.status);
  }
  return response.text();
}

export async function testHomeAssistantConnection(): Promise<ConnectionTestResult> {
  const { baseUrl, token } = credentials();
  const restResponse = await fetch(`${baseUrl}/api/`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  let websocket = false;
  let version: string | undefined;
  try {
    const wsUrl = baseUrl.replace(/^http/i, "ws") + "/api/websocket";
    websocket = await new Promise<boolean>((resolve) => {
      const socket = new WebSocket(wsUrl);
      const timer = setTimeout(() => {
        socket.close();
        resolve(false);
      }, 3500);

      socket.on("message", (raw) => {
        const message = JSON.parse(raw.toString()) as { type: string; ha_version?: string };
        if (message.type === "auth_required") {
          version = message.ha_version;
          socket.send(JSON.stringify({ type: "auth", access_token: token }));
        }
        if (message.type === "auth_ok") {
          clearTimeout(timer);
          socket.close();
          resolve(true);
        }
        if (message.type === "auth_invalid") {
          clearTimeout(timer);
          socket.close();
          resolve(false);
        }
      });
      socket.on("error", () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  } catch {
    websocket = false;
  }

  return {
    rest: restResponse.ok,
    websocket,
    version,
    message:
      restResponse.ok && websocket
        ? "Home Assistant REST and WebSocket checks passed."
        : "REST or WebSocket connectivity failed. Confirm URL, token, and network access."
  };
}

export async function collectHomeAssistantSnapshot(): Promise<HaSnapshot> {
  const [config, states, services, components] = await Promise.all([
    haFetch<Record<string, unknown>>("/api/config"),
    haFetch<HaState[]>("/api/states"),
    haFetch<unknown[]>("/api/services"),
    haFetch<string[]>("/api/components")
  ]);

  const { excludedDomains, excludedEntities } = credentials();
  const filteredStates = states.filter((state) => {
    const domain = state.entity_id.split(".")[0];
    return !excludedDomains.includes(domain) && !excludedEntities.includes(state.entity_id);
  });
  const automationStates = filteredStates.filter((state) => state.entity_id.startsWith("automation."));
  const diagnostics = await collectDiagnostics(filteredStates);

  return {
    capturedAt: new Date().toISOString(),
    config: redactConfig(config),
    states: filteredStates.map(redactState),
    services,
    components,
    automationStates,
    diagnostics,
    health: {
      unavailableCount: filteredStates.filter((state) => state.state === "unavailable").length,
      unknownCount: filteredStates.filter((state) => state.state === "unknown").length,
      batteryLowCount: countLowBatteries(filteredStates)
    }
  };
}

async function collectDiagnostics(states: HaState[]): Promise<HaSnapshot["diagnostics"]> {
  const collectionWarnings: string[] = [];
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [errorLogPatterns, logbookPatterns, historyPatterns] = await Promise.all([
    collectOptional("error_log", collectionWarnings, async () => summarizeErrorLog(await haFetchText("/api/error_log"))),
    collectOptional("logbook", collectionWarnings, async () =>
      summarizeLogbook(
        await haFetch<RawLogbookEntry[]>(
          `/api/logbook/${encodeURIComponent(start.toISOString())}?end_time=${encodeURIComponent(end.toISOString())}`
        )
      )
    ),
    collectOptional("history", collectionWarnings, async () =>
      summarizeHistory(await fetchHistory(selectHistoryEntities(states), start, end))
    )
  ]);

  return {
    errorLogPatterns,
    logbookPatterns,
    historyPatterns,
    collectionWarnings
  };
}

async function collectOptional<T>(
  source: string,
  warnings: string[],
  collect: () => Promise<T[]>
): Promise<T[]> {
  try {
    return await collect();
  } catch (error) {
    const message = error instanceof Error ? error.message : `Home Assistant ${source} collection failed`;
    const notAvailable = error instanceof HomeAssistantApiError && error.status === 404;
    warnings.push(notAvailable ? `${source}: not available on this Home Assistant instance` : `${source}: ${message}`);
    addAppLog({
      level: notAvailable ? "info" : "warning",
      source: "home-assistant",
      message: notAvailable ? `${source} diagnostics not available` : `Skipped ${source} diagnostics`,
      details: message
    });
    return [];
  }
}

export function summarizeErrorLog(raw: string): HaErrorLogPattern[] {
  const patterns = new Map<string, HaErrorLogPattern>();
  for (const line of raw.split(/\r?\n/)) {
    const normalized = normalizeErrorLogLine(line);
    if (!normalized) continue;
    const key = `${normalized.source}:${normalized.message}`;
    const existing = patterns.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      patterns.set(key, { ...normalized, count: 1 });
    }
  }
  return [...patterns.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

function normalizeErrorLogLine(line: string): Omit<HaErrorLogPattern, "count"> | null {
  const trimmed = redactSensitiveText(line).trim();
  if (!trimmed) return null;

  const withoutTimestamp = trimmed
    .replace(/^\d{2}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+/, "")
    .replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?\s+/, "");
  const separator = withoutTimestamp.indexOf(":");
  const source = separator > 0 ? withoutTimestamp.slice(0, separator).trim() : "homeassistant";
  const message = separator > 0 ? withoutTimestamp.slice(separator + 1).trim() : withoutTimestamp;
  const severity = /warning|warn/i.test(message) ? "warning" : "error";

  return {
    source: source.slice(0, 140),
    message: message.slice(0, 280),
    severity
  };
}

export interface RawLogbookEntry {
  context_user_id?: string | null;
  domain?: string;
  entity_id?: string;
  message?: string;
  name?: string;
  when?: string;
}

export function summarizeLogbook(entries: RawLogbookEntry[]): HaLogbookPattern[] {
  const patterns = new Map<string, HaLogbookPattern>();
  for (const entry of entries.slice(-1000)) {
    const message = redactSensitiveText(String(entry.message ?? "")).trim();
    if (!message) continue;
    const entityId = entry.entity_id;
    const domain = entry.domain ?? entityId?.split(".")[0];
    const key = `${entityId ?? domain ?? "unknown"}:${message}`;
    const existing = patterns.get(key);
    if (existing) {
      existing.count += 1;
      existing.firstSeen = earliest(existing.firstSeen, entry.when);
      existing.lastSeen = latest(existing.lastSeen, entry.when);
    } else {
      patterns.set(key, {
        entityId,
        domain,
        name: entry.name ? redactSensitiveText(String(entry.name)).slice(0, 120) : undefined,
        message: message.slice(0, 220),
        count: 1,
        firstSeen: entry.when,
        lastSeen: entry.when
      });
    }
  }

  return [...patterns.values()]
    .filter((pattern) => pattern.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

export function selectHistoryEntities(states: HaState[]): string[] {
  const preferredDomains = new Set([
    "automation",
    "binary_sensor",
    "climate",
    "cover",
    "fan",
    "input_boolean",
    "light",
    "lock",
    "media_player",
    "person",
    "sensor",
    "switch"
  ]);
  return states
    .filter((state) => preferredDomains.has(state.entity_id.split(".")[0]))
    .sort((a, b) => historyPriority(a) - historyPriority(b))
    .slice(0, 60)
    .map((state) => state.entity_id);
}

function historyPriority(state: HaState): number {
  if (state.state === "unavailable" || state.state === "unknown") return 0;
  const domain = state.entity_id.split(".")[0];
  if (["automation", "binary_sensor", "light", "switch", "climate"].includes(domain)) return 1;
  return 2;
}

export type RawHistoryState = Partial<HaState> & { last_changed?: string };

async function fetchHistory(entityIds: string[], start: Date, end: Date): Promise<RawHistoryState[][]> {
  const series: RawHistoryState[][] = [];
  for (const chunk of chunks(entityIds, 25)) {
    if (!chunk.length) continue;
    const path =
      `/api/history/period/${encodeURIComponent(start.toISOString())}` +
      `?filter_entity_id=${encodeURIComponent(chunk.join(","))}` +
      `&end_time=${encodeURIComponent(end.toISOString())}` +
      "&minimal_response&no_attributes&significant_changes_only";
    const response = await haFetch<RawHistoryState[][]>(path);
    response.forEach((item, index) => {
      const fallbackEntityId = chunk[index];
      series.push(item.map((state) => ({ ...state, entity_id: state.entity_id ?? fallbackEntityId })));
    });
  }
  return series;
}

export function summarizeHistory(series: RawHistoryState[][]): HaHistoryPattern[] {
  const patterns: HaHistoryPattern[] = [];
  for (const items of series) {
    const entityId = items.find((item) => item.entity_id)?.entity_id;
    if (!entityId) continue;
    const states = items.map((item) => String(item.state ?? "")).filter(Boolean);
    const uniqueStates = [...new Set(states)].slice(0, 8);
    const unavailableCount = states.filter((state) => state === "unavailable" || state === "unknown").length;
    patterns.push({
      entityId,
      changeCount: Math.max(items.length - 1, 0),
      unavailableCount,
      states: uniqueStates,
      firstChanged: items[0]?.last_changed,
      lastChanged: items[items.length - 1]?.last_changed
    });
  }

  return patterns
    .filter((item) => item.changeCount >= 3 || item.unavailableCount > 0)
    .sort((a, b) => b.unavailableCount - a.unavailableCount || b.changeCount - a.changeCount)
    .slice(0, 20);
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function earliest(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

function latest(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function redactConfig(config: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...config };
  delete rest.latitude;
  delete rest.longitude;
  delete rest.elevation;
  return rest;
}

function redactState(state: HaState): HaState {
  const attributes = { ...state.attributes };
  for (const key of ["latitude", "longitude", "gps_accuracy", "ip_address", "mac_address"]) {
    delete attributes[key];
  }
  return { ...state, attributes };
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(access_token|token|api_key|password|passwd|secret)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]")
    .replace(/\b[0-9a-f]{2}(?::[0-9a-f]{2}){5}\b/gi, "[mac]")
    .replace(/https?:\/\/[^\s)]+/gi, "[url]")
    .replace(/\/(?:config|home|usr|var|opt)\/[^\s)]+/gi, "[path]");
}

function countLowBatteries(states: HaState[]): number {
  return states.filter((state) => {
    const domain = state.entity_id.split(".")[0];
    const deviceClass = state.attributes.device_class;
    const numericState = Number(state.state);
    return domain === "sensor" && deviceClass === "battery" && Number.isFinite(numericState) && numericState <= 20;
  }).length;
}
