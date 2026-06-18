import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../src/server/app.js";
import { closeDb } from "../../src/server/db/database.js";
import { checkForUpdatesIfDue } from "../../src/server/services/updateCheck.js";

let dataDir = "";

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "haai-system-routes-"));
  process.env.HAAI_DATA_DIR = dataDir;
});

afterEach(() => {
  vi.restoreAllMocks();
  closeDb();
  delete process.env.HAAI_DATA_DIR;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("system update routes", () => {
  it("checks public GitHub releases without an Authorization header", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            draft: false,
            prerelease: false,
            tag_name: "v1.0.1",
            html_url: "https://github.com/roach0816/haai/releases/tag/v1.0.1",
            body: "Public release",
            assets: [{ name: "haai-1.0.1.tgz" }]
          }
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const app = await buildApp();
    const setup = await app.inject({
      method: "POST",
      url: "/api/auth/setup",
      payload: { username: "admin", password: "password123" }
    });
    const cookie = setup.headers["set-cookie"];

    const response = await app.inject({
      method: "POST",
      url: "/api/system/update",
      headers: { cookie: Array.isArray(cookie) ? cookie[0] : cookie ?? "" },
      payload: { action: "check" }
    });

    expect(response.statusCode).toBe(200);
    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "haai-updater"
    });
    expect((init as RequestInit).headers).not.toHaveProperty("Authorization");

    await app.close();
  });

  it("checks once when the hourly update interval is due", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            draft: false,
            prerelease: false,
            tag_name: "v1.0.8",
            html_url: "https://github.com/roach0816/haai/releases/tag/v1.0.8",
            body: "Next release",
            assets: [{ name: "haai-1.0.8.tgz" }]
          }
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    expect(await checkForUpdatesIfDue(60 * 60 * 1000)).toBe(true);
    expect(await checkForUpdatesIfDue(60 * 60 * 1000)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
