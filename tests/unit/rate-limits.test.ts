import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../src/server/app.js";
import { closeDb } from "../../src/server/db/database.js";

vi.mock("../../src/server/services/analysis.js", () => ({
  runAnalysis: vi.fn(async () => "run_test")
}));

vi.mock("../../src/server/services/certificates.js", () => ({
  startLetsEncryptCertificateRequest: vi.fn(() => ({ status: "requesting" })),
  startLetsEncryptCertificateRenewal: vi.fn(() => ({ status: "requesting" }))
}));

let app: FastifyInstance | undefined;
let cookie = "";
let dataDir = "";

beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "haai-rate-limits-"));
  process.env.HAAI_DATA_DIR = dataDir;
  process.env.HAAI_DEPLOYMENT_MODE = "container";
  app = await buildApp();

  const setup = await app.inject({
    method: "POST",
    url: "/api/auth/setup",
    payload: { username: "admin", password: "password123" }
  });
  const setCookie = setup.headers["set-cookie"];
  cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie ?? "";
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  vi.clearAllMocks();
  closeDb();
  delete process.env.HAAI_DATA_DIR;
  delete process.env.HAAI_DEPLOYMENT_MODE;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("authenticated route rate limits", () => {
  it("limits analysis run reads and starts", async () => {
    const read = await inject("GET", "/api/analysis-runs");
    expect(read.headers["x-ratelimit-limit"]).toBe("60");

    const starts = [];
    for (let index = 0; index < 4; index += 1) {
      starts.push(await inject("POST", "/api/analysis-runs"));
    }
    expect(starts.slice(0, 3).map((response) => response.statusCode)).toEqual([202, 202, 202]);
    expect(starts[3].statusCode).toBe(429);
  });

  it("limits certificate request, renewal, and reset actions", async () => {
    const request = await inject("POST", "/api/settings/runtime/certificate");
    const renewal = await inject("POST", "/api/settings/runtime/certificate/renew");
    const reset = await inject("POST", "/api/settings/runtime/certificate/reset");

    expect(request.headers["x-ratelimit-limit"]).toBe("3");
    expect(renewal.headers["x-ratelimit-limit"]).toBe("3");
    expect(reset.headers["x-ratelimit-limit"]).toBe("10");
  });

  it("limits update status reads and update actions", async () => {
    const read = await inject("GET", "/api/system/update");
    expect(read.headers["x-ratelimit-limit"]).toBe("60");

    const actions = [];
    for (let index = 0; index < 11; index += 1) {
      actions.push(await inject("POST", "/api/system/update", { action: "apply" }));
    }
    expect(actions.slice(0, 10).every((response) => response.statusCode === 200)).toBe(true);
    expect(actions[10].statusCode).toBe(429);
  });
});

async function inject(method: "GET" | "POST", url: string, payload?: unknown) {
  return app!.inject({
    method,
    url,
    headers: { cookie },
    payload
  });
}
