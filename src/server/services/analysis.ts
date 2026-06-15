import { suggestionCategories } from "../../shared/types.js";
import { analyzeSnapshotWithProvider } from "../ai/providers.js";
import { collectHomeAssistantSnapshot } from "../adapters/homeAssistant.js";
import {
  completeAnalysisRun,
  createAnalysisRun,
  failAnalysisRun,
  addAppLog,
  saveSnapshot,
  saveSuggestions
} from "../db/repositories.js";
import { generateHeuristicSuggestions, mergeSuggestions } from "./heuristics.js";

let activeRun: Promise<string> | null = null;

export async function runAnalysis(trigger: "manual" | "scheduled" | "regenerate" = "manual"): Promise<string> {
  if (activeRun) return activeRun;

  activeRun = doRunAnalysis(trigger).finally(() => {
    activeRun = null;
  });
  return activeRun;
}

async function doRunAnalysis(trigger: "manual" | "scheduled" | "regenerate"): Promise<string> {
  const run = createAnalysisRun(trigger);
  addAppLog({ source: "analysis", message: `Analysis run started (${trigger})`, details: { runId: run.id } });
  try {
    const snapshot = await collectHomeAssistantSnapshot();
    const snapshotId = saveSnapshot(snapshot);
    addAppLog({
      source: "analysis",
      message: "Home Assistant snapshot captured",
      details: { runId: run.id, snapshotId, entityCount: snapshot.states.length }
    });
    const aiSuggestions = await analyzeSnapshotWithProvider(snapshot, {
      categories: suggestionCategories,
      maxSuggestions: 12
    }).catch((error) => {
      console.warn("AI provider failed; falling back to heuristic suggestions", error);
      addAppLog({
        level: "warning",
        source: "ai",
        message: "AI provider failed; using heuristic suggestions",
        details: error instanceof Error ? error.message : "Unknown AI provider error"
      });
      return [];
    });
    const suggestions = mergeSuggestions(aiSuggestions, generateHeuristicSuggestions(snapshot));
    const savedSuggestions = saveSuggestions(run.id, suggestions);
    completeAnalysisRun(
      run.id,
      `Generated ${savedSuggestions.length} suggestions from ${snapshot.states.length} Home Assistant entities. Snapshot ${snapshotId}.`
    );
    addAppLog({
      source: "analysis",
      message: "Analysis run completed",
      details: { runId: run.id, suggestionCount: savedSuggestions.length }
    });
    return run.id;
  } catch (error) {
    failAnalysisRun(run.id, error instanceof Error ? error.message : "Unknown analysis error");
    addAppLog({
      level: "error",
      source: "analysis",
      message: "Analysis run failed",
      details: error instanceof Error ? error.message : "Unknown analysis error"
    });
    throw error;
  }
}
