import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import {
  getAiSettings,
  getHomeAssistantSettings,
  getUpdateSettings,
  saveAiSettings,
  saveHomeAssistantSettings,
  saveUpdateSettings
} from "../db/repositories.js";
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
  maxTokensPerRun: z.number().int().min(1000).max(200000),
  monthlyBudgetUsd: z.number().min(0).max(10000),
  scheduleCron: z.string().regex(/^\d{1,2}\s+\d{1,2}\s+\*\s+\*\s+\*$/),
  enabled: z.boolean()
});

const updateSchema = z.object({
  source: z.enum(["github", "manifest"]),
  githubOwner: z.string().max(120).default(""),
  githubRepo: z.string().max(120).default(""),
  githubToken: z.string().optional(),
  manifestUrl: z.string().max(500).default("")
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
}
