import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth.js";
import { testHomeAssistantConnection } from "../adapters/homeAssistant.js";

export async function homeAssistantRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/home-assistant/test", { preHandler: requireAuth }, async () =>
    testHomeAssistantConnection()
  );
}
