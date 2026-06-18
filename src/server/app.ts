import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import fs from "node:fs";
import type { Server as HttpsServer } from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "./config.js";
import { authRoutes } from "./routes/auth.js";
import { settingsRoutes } from "./routes/settings.js";
import { homeAssistantRoutes } from "./routes/homeAssistant.js";
import { analysisRoutes } from "./routes/analysis.js";
import { systemRoutes } from "./routes/system.js";

export async function buildApp() {
  const config = getConfig();
  const fastifyOptions = { logger: true, trustProxy: config.trustProxy };
  const app = (config.httpsEnabled
    ? fastify<HttpsServer>({
        ...fastifyOptions,
        https: {
          cert: fs.readFileSync(config.certPath),
          key: fs.readFileSync(config.keyPath)
        }
      })
    : fastify(fastifyOptions)) as FastifyInstance;
  await app.register(helmet, {
    contentSecurityPolicy: false
  });
  await app.register(rateLimit, {
    global: false
  });
  await app.register(cookie);
  await app.register(authRoutes);
  await app.register(settingsRoutes);
  await app.register(homeAssistantRoutes);
  await app.register(analysisRoutes);
  await app.register(systemRoutes);

  app.setErrorHandler((error, _request, reply) => {
    const appError = error as Error & { statusCode?: number };
    const status = appError.statusCode ? Number(appError.statusCode) : 500;
    app.log.error(error);
    reply.code(status >= 400 ? status : 500).send({ error: appError.message });
  });

  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientDir = path.resolve(dirname, "../client");
  await app.register(fastifyStatic, {
    root: clientDir,
    wildcard: false
  });
  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api/")) return reply.code(404).send({ error: "Not found" });
    return reply.sendFile("index.html");
  });

  return app;
}
