import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "../../src/server/db/database.js";
import { setSetting } from "../../src/server/db/database.js";
import {
  addAppLog,
  createAnalysisRun,
  getUpdateSettings,
  listAppLogs,
  listSuggestions,
  saveSuggestions
} from "../../src/server/db/repositories.js";
import type { Suggestion } from "../../src/shared/types.js";

let dataDir = "";

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "haai-test-"));
  process.env.HAAI_DATA_DIR = dataDir;
});

afterEach(() => {
  closeDb();
  delete process.env.HAAI_DATA_DIR;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("suggestion repository", () => {
  it("does not store or list duplicate suggestions by category and title", () => {
    const run = createAnalysisRun("manual");
    const suggestion = createSuggestion("Automation Opportunities", "Audit disabled automations");

    expect(saveSuggestions(run.id, [suggestion, suggestion])).toHaveLength(1);

    const secondRun = createAnalysisRun("manual");
    expect(saveSuggestions(secondRun.id, [suggestion])).toHaveLength(0);

    expect(listSuggestions({ status: "new" })).toHaveLength(1);
  });
});

describe("app log repository", () => {
  it("returns paginated log entries with total count", () => {
    addAppLog({ source: "test", message: "First" });
    addAppLog({ source: "test", message: "Second" });
    addAppLog({ source: "test", message: "Third" });

    const firstPage = listAppLogs(1, 2);
    const secondPage = listAppLogs(2, 2);

    expect(firstPage.total).toBe(3);
    expect(firstPage.page).toBe(1);
    expect(firstPage.pageSize).toBe(2);
    expect(firstPage.items).toHaveLength(2);
    expect(secondPage.items).toHaveLength(1);
  });
});

describe("update settings repository", () => {
  it("defaults to the public HAAI GitHub release source without requiring a token", () => {
    expect(getUpdateSettings()).toMatchObject({
      source: "github",
      githubOwner: "roach0816",
      githubRepo: "haai",
      githubTokenConfigured: false
    });
  });

  it("normalizes legacy blank GitHub settings to the public release source", () => {
    setSetting("update", {
      source: "github",
      githubOwner: "",
      githubRepo: "",
      githubTokenConfigured: false,
      manifestUrl: ""
    });

    expect(getUpdateSettings()).toMatchObject({
      source: "github",
      githubOwner: "roach0816",
      githubRepo: "haai",
      githubTokenConfigured: false
    });
  });
});

function createSuggestion(
  category: Suggestion["category"],
  title: string
): Omit<Suggestion, "id" | "runId" | "status" | "createdAt"> {
  return {
    category,
    title,
    rationale: "This is a useful read-only recommendation.",
    confidence: 0.8,
    effort: "small",
    risk: "low",
    evidence: ["automation.example exists"],
    yaml: "",
    installSteps: ["Review the recommendation in Home Assistant."],
    rollbackSteps: ["No changes were made by HAAI."]
  };
}
