import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import {
  getAiSettings,
  addAppLog,
  getHomeAssistantSettings,
  getRuntimeSettings,
  getUpdateSettings,
  resetCertificateRequest,
  saveAiSettings,
  saveHomeAssistantSettings,
  saveRuntimeSettings,
  saveUpdateSettings
} from "../db/repositories.js";
import {
  startLetsEncryptCertificateRenewal,
  startLetsEncryptCertificateRequest
} from "../services/certificates.js";
import { writeRuntimeConfig } from "../services/runtimeConfig.js";
import { writeUpdaterConfig } from "../services/updateConfig.js";

const haSchema = z.object({
  baseUrl: z.string().url(),
  token: z.string().optional(),
  verifyTls: z.boolean().default(true),
  excludedDomains: z.array(z.string()).default([]),
  excludedEntities: z.array(z.string()).default([])
});

const aiSchema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini"]),
  model: z.string().min(2).max(120),
  apiKey: z.string().optional(),
  mcpAuthorization: z.string().optional(),
  maxTokensPerRun: z.number().int().min(1000).max(200000),
  monthlyBudgetUsd: z.number().min(0).max(10000),
  scheduleCron: z.string().regex(/^\d{1,2}\s+\d{1,2}\s+\*\s+\*\s+\*$/),
  enabled: z.boolean(),
  promptTemplate: z.string().max(4000).optional(),
  mcp: z.object({
    enabled: z.boolean(),
    serverLabel: z.string().min(1).max(80),
    serverUrl: z.string().max(500),
    serverDescription: z.string().max(300),
    authorizationConfigured: z.boolean().optional(),
    allowedTools: z.array(z.string().min(1).max(120)).max(50)
  })
}).superRefine((value, context) => {
  if (!value.mcp.enabled) return;
  if (value.provider !== "openai") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["mcp", "enabled"],
      message: "MCP is currently supported only for OpenAI."
    });
  }
  const parsed = z.string().url().safeParse(value.mcp.serverUrl);
  if (!parsed.success || !/^https?:\/\//i.test(value.mcp.serverUrl)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["mcp", "serverUrl"],
      message: "MCP server URL must be a valid HTTP or HTTPS URL."
    });
  }
});

const updateSchema = z.object({
  source: z.enum(["github", "manifest"]),
  githubOwner: z.string().max(120).default(""),
  githubRepo: z.string().max(120).default(""),
  githubToken: z.string().optional(),
  manifestUrl: z.string().max(500).default("")
});

const runtimeSchema = z.object({
  httpPort: z.number().int().min(1).max(65535),
  httpsPort: z.number().int().min(1).max(65535),
  httpsEnabled: z.boolean(),
  ssl: z.object({
    hostname: z.string().max(253).default(""),
    dnsProvider: z.enum(["cloudflare"]).default("cloudflare"),
    token: z.string().optional()
  })
});

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/settings/home-assistant", { preHandler: requireAuth }, async () =>
    getHomeAssistantSettings(false)
  );

  app.put("/api/settings/home-assistant", { preHandler: requireAuth }, async (request) => {
    const body = haSchema.parse(request.body);
    return saveHomeAssistantSettings(body);
  });

  app.get("/api/settings/ai-provider", { preHandler: requireAuth }, async () => getAiSettings(false));

  app.put("/api/settings/ai-provider", { preHandler: requireAuth }, async (request) => {
    const body = aiSchema.parse(request.body);
    return saveAiSettings(body);
  });

  app.get("/api/settings/update", { preHandler: requireAuth }, async () => getUpdateSettings(false));

  app.put("/api/settings/update", { preHandler: requireAuth }, async (request) => {
    const body = updateSchema.parse(request.body);
    const saved = saveUpdateSettings(body);
    writeUpdaterConfig();
    return saved;
  });

  app.get("/api/settings/runtime", { preHandler: requireAuth }, async () =>
    getRuntimeSettings(false)
  );

  app.put("/api/settings/runtime", { preHandler: requireAuth }, async (request) => {
    const body = runtimeSchema.parse(request.body);
    const saved = saveRuntimeSettings(body);
    writeRuntimeConfig();
    return saved;
  });

  app.post(
    "/api/settings/runtime/certificate",
    {
      preHandler: requireAuth,
      config: { rateLimit: { max: 3, timeWindow: "1 hour" } }
    },
    async () => {
      addAppLog({ source: "certificates", message: "Certificate request started" });
      return startLetsEncryptCertificateRequest();
    }
  );

  app.post(
    "/api/settings/runtime/certificate/renew",
    {
      preHandler: requireAuth,
      config: { rateLimit: { max: 3, timeWindow: "1 hour" } }
    },
    async () => {
      addAppLog({ source: "certificates", message: "Certificate renewal requested" });
      return startLetsEncryptCertificateRenewal(true);
    }
  );

  app.post(
    "/api/settings/runtime/certificate/reset",
    {
      preHandler: requireAuth,
      config: { rateLimit: { max: 10, timeWindow: "15 minutes" } }
    },
    async () => {
      addAppLog({ source: "certificates", message: "Certificate status reset" });
      return resetCertificateRequest();
    }
  );
}
