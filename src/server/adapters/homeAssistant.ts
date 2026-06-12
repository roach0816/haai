import WebSocket from "ws";
import type { HaSnapshot, HaState } from "../../shared/types.js";
import { getHomeAssistantSettings } from "../db/repositories.js";

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
    throw new Error(`Home Assistant ${path} returned ${response.status}`);
  }
  return (await response.json()) as T;
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

  return {
    capturedAt: new Date().toISOString(),
    config: redactConfig(config),
    states: filteredStates.map(redactState),
    services,
    components,
    automationStates,
    health: {
      unavailableCount: filteredStates.filter((state) => state.state === "unavailable").length,
      unknownCount: filteredStates.filter((state) => state.state === "unknown").length,
      batteryLowCount: countLowBatteries(filteredStates)
    }
  };
}

function redactConfig(config: Record<string, unknown>): Record<string, unknown> {
  const { latitude: _lat, longitude: _lon, elevation: _elevation, ...rest } = config;
  return rest;
}

function redactState(state: HaState): HaState {
  const attributes = { ...state.attributes };
  for (const key of ["latitude", "longitude", "gps_accuracy", "ip_address", "mac_address"]) {
    delete attributes[key];
  }
  return { ...state, attributes };
}

function countLowBatteries(states: HaState[]): number {
  return states.filter((state) => {
    const domain = state.entity_id.split(".")[0];
    const deviceClass = state.attributes.device_class;
    const numericState = Number(state.state);
    return domain === "sensor" && deviceClass === "battery" && Number.isFinite(numericState) && numericState <= 20;
  }).length;
}
