import { suggestionCategories } from "../../shared/types.js";
import { analyzeSnapshotWithProvider } from "../ai/providers.js";
import { collectHomeAssistantSnapshot } from "../adapters/homeAssistant.js";
import {
  completeAnalysisRun,
  createAnalysisRun,
  failAnalysisRun,
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
  try {
    const snapshot = await collectHomeAssistantSnapshot();
    const snapshotId = saveSnapshot(snapshot);
    const aiSuggestions = await analyzeSnapshotWithProvider(snapshot, {
      categories: suggestionCategories,
      maxSuggestions: 12
    }).catch((error) => {
      console.warn("AI provider failed; falling back to heuristic suggestions", error);
      return [];
    });
    const suggestions = mergeSuggestions(aiSuggestions, generateHeuristicSuggestions(snapshot));
    saveSuggestions(run.id, suggestions);
    completeAnalysisRun(
      run.id,
      `Generated ${suggestions.length} suggestions from ${snapshot.states.length} Home Assistant entities. Snapshot ${snapshotId}.`
    );
    return run.id;
  } catch (error) {
    failAnalysisRun(run.id, error instanceof Error ? error.message : "Unknown analysis error");
    throw error;
  }
}
