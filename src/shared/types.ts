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
  health: {
    unavailableCount: number;
    unknownCount: number;
    batteryLowCount: number;
  };
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
  lastRun?: AnalysisRun;
  update: {
    currentVersion: string;
    availableVersion?: string;
    checkedAt?: string;
    status: "idle" | "checking" | "available" | "applying" | "failed";
    error?: string;
    releaseUrl?: string;
    releaseNotes?: string;
    archiveName?: string;
    progress?: {
      label: string;
      percent: number;
    };
  };
}
