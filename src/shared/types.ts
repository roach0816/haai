export const suggestionCategories = [
  "Automation Opportunities",
  "Automation Improvements",
  "Reliability & Safety",
  "Energy & Comfort",
  "Organization & Maintenance"
] as const;

export type SuggestionCategory = (typeof suggestionCategories)[number];
export type SuggestionStatus = "new" | "copied" | "dismissed";
export type RiskLevel = "low" | "medium" | "high";
export type AiProvider = "openai" | "anthropic" | "gemini";

export interface HomeAssistantSettings {
  baseUrl: string;
  tokenConfigured: boolean;
  verifyTls: boolean;
  excludedDomains: string[];
  excludedEntities: string[];
}

export interface AiSettings {
  provider: AiProvider;
  model: string;
  apiKeyConfigured: boolean;
  maxTokensPerRun: number;
  monthlyBudgetUsd: number;
  scheduleCron: string;
  enabled: boolean;
  promptTemplate: string;
  mcp: {
    enabled: boolean;
    serverLabel: string;
    serverUrl: string;
    serverDescription: string;
    authorizationConfigured: boolean;
    allowedTools: string[];
  };
}

export interface UpdateSettings {
  source: "github" | "manifest";
  githubOwner: string;
  githubRepo: string;
  githubTokenConfigured: boolean;
  manifestUrl: string;
}

export interface RuntimeSettings {
  httpPort: number;
  httpsPort: number;
  httpsEnabled: boolean;
  restartRequired: boolean;
  ssl: {
    hostname: string;
    dnsProvider: "cloudflare";
    dnsTokenConfigured: boolean;
    status: "not_configured" | "ready" | "requesting" | "failed";
    requestedAt?: string;
    issuedAt?: string;
    expiresAt?: string;
    error?: string;
  };
}

export interface HaState {
  entity_id: string;
  state: string;
  last_changed?: string;
  last_updated?: string;
  attributes: Record<string, unknown>;
}

export interface HaSnapshot {
  capturedAt: string;
  config: Record<string, unknown>;
  states: HaState[];
  services: unknown[];
  components: string[];
  automationStates: HaState[];
  diagnostics: {
    errorLogPatterns: HaErrorLogPattern[];
    logbookPatterns: HaLogbookPattern[];
    historyPatterns: HaHistoryPattern[];
    collectionWarnings: string[];
  };
  health: {
    unavailableCount: number;
    unknownCount: number;
    batteryLowCount: number;
  };
}

export interface HaErrorLogPattern {
  source: string;
  message: string;
  count: number;
  severity: "warning" | "error";
}

export interface HaLogbookPattern {
  entityId?: string;
  domain?: string;
  name?: string;
  message: string;
  count: number;
  firstSeen?: string;
  lastSeen?: string;
}

export interface HaHistoryPattern {
  entityId: string;
  changeCount: number;
  unavailableCount: number;
  states: string[];
  firstChanged?: string;
  lastChanged?: string;
}

export interface Suggestion {
  id: string;
  runId: string;
  category: SuggestionCategory;
  title: string;
  rationale: string;
  confidence: number;
  effort: "small" | "medium" | "large";
  risk: RiskLevel;
  evidence: string[];
  yaml: string;
  installSteps: string[];
  rollbackSteps: string[];
  status: SuggestionStatus;
  createdAt: string;
}

export interface AnalysisRun {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  trigger: "manual" | "scheduled" | "regenerate";
  startedAt: string;
  completedAt?: string;
  summary?: string;
  error?: string;
  suggestionCount: number;
}

export interface AppLog {
  id: string;
  level: "info" | "warning" | "error";
  source: string;
  message: string;
  details?: string;
  createdAt: string;
}

export interface AppLogPage {
  items: AppLog[];
  page: number;
  pageSize: number;
  total: number;
}

export interface SystemHealth {
  setupComplete: boolean;
  authenticated: boolean;
  version: string;
  databasePath: string;
  network: {
    host: string;
    port: number;
    protocol: "http" | "https";
  };
  tls: {
    hostname: string;
    httpsEnabled: boolean;
    status: RuntimeSettings["ssl"]["status"];
    requestedAt?: string;
    issuedAt?: string;
    expiresAt?: string;
    error?: string;
  };
  lastRun?: AnalysisRun;
  deployment: {
    mode: "appliance" | "container";
    updateApplySupported: boolean;
  };
  update: {
    currentVersion: string;
    availableVersion?: string;
    checkedAt?: string;
    status: "idle" | "checking" | "available" | "applying" | "failed";
    error?: string;
    releaseUrl?: string;
    releaseNotes?: string;
    archiveName?: string;
    updateInstructions?: string[];
    progress?: {
      label: string;
      percent: number;
    };
  };
}
