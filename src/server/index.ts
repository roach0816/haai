import { buildApp } from "./app.js";
import { getConfig } from "./config.js";
import { getDb } from "./db/database.js";
import { startScheduler, stopScheduler } from "./services/scheduler.js";

const config = getConfig();
getDb();

const app = await buildApp();
startScheduler();

const shutdown = async () => {
  stopScheduler();
  await app.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ host: config.host, port: config.port });
