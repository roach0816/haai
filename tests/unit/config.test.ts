import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readOptionalSecret } from "../../src/server/config.js";

afterEach(() => {
  delete process.env.HAAI_SECRET;
  delete process.env.HAAI_SECRET_FILE;
});

describe("configuration secret loading", () => {
  it("reads direct environment secrets", () => {
    process.env.HAAI_SECRET = "direct-secret";

    expect(readOptionalSecret("HAAI_SECRET")).toBe("direct-secret");
  });

  it("prefers file-backed secrets and trims only one trailing newline", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "haai-secret-"));
    const secretPath = path.join(dir, "secret");
    fs.writeFileSync(secretPath, "file-secret\n");
    process.env.HAAI_SECRET = "direct-secret";
    process.env.HAAI_SECRET_FILE = secretPath;

    expect(readOptionalSecret("HAAI_SECRET")).toBe("file-secret");

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("throws a clear error when a configured secret file is missing", () => {
    process.env.HAAI_SECRET_FILE = "/tmp/haai-missing-secret-file";

    expect(() => readOptionalSecret("HAAI_SECRET")).toThrow("HAAI_SECRET_FILE points to a missing file");
  });
});
