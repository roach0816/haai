import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import {
  listAnalysisRuns,
  listSuggestions,
  updateSuggestionStatus
} from "../db/repositories.js";
import { runAnalysis } from "../services/analysis.js";

export async function analysisRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/analysis-runs", { preHandler: requireAuth }, async (_request, reply) => {
    const runId = await runAnalysis("manual");
    return reply.code(202).send({ runId });
  });

  app.get("/api/analysis-runs", { preHandler: requireAuth }, async () => listAnalysisRuns());

  app.get("/api/suggestions", { preHandler: requireAuth }, async (request) => {
    const query = z
      .object({ category: z.string().optional(), status: z.string().optional() })
      .parse(request.query);
    return listSuggestions(query);
  });

  app.patch("/api/suggestions/:id", { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ status: z.enum(["new", "copied", "dismissed"]) }).parse(request.body);
    const suggestion = updateSuggestionStatus(params.id, body.status);
    if (!suggestion) return reply.code(404).send({ error: "Suggestion not found" });
    return suggestion;
  });

  app.post("/api/suggestions/:id/regenerate", { preHandler: requireAuth }, async (_request, reply) => {
    const runId = await runAnalysis("regenerate");
    return reply.code(202).send({ runId });
  });
}
