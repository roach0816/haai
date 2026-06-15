import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "../../src/server/db/database.js";
import {
  createAnalysisRun,
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
