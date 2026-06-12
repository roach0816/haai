import type { HaSnapshot } from "../../shared/types.js";
import { getAiSettings } from "../db/repositories.js";
import { aiSuggestionListSchema, type AiSuggestionInput } from "./schema.js";

export interface AnalyzeConstraints {
  categories: readonly string[];
  maxSuggestions: number;
}

export async function analyzeSnapshotWithProvider(
  snapshot: HaSnapshot,
  constraints: AnalyzeConstraints
): Promise<AiSuggestionInput[]> {
  const settings = getAiSettings(true);
  if (!settings.enabled || !settings.apiKey) {
    return [];
  }

  const prompt = buildPrompt(snapshot, constraints);
  const raw =
    settings.provider === "openai"
      ? await callOpenAi(settings.apiKey, settings.model, prompt)
      : settings.provider === "anthropic"
        ? await callAnthropic(settings.apiKey, settings.model, prompt)
        : await callGemini(settings.apiKey, settings.model, prompt);

  const json = extractJson(raw);
  const parsed = aiSuggestionListSchema.parse(JSON.parse(json));
  return parsed.suggestions;
}

function buildPrompt(snapshot: HaSnapshot, constraints: AnalyzeConstraints): string {
  const compactSnapshot = {
    capturedAt: snapshot.capturedAt,
    componentCount: snapshot.components.length,
    entityCount: snapshot.states.length,
    automationCount: snapshot.automationStates.length,
    health: snapshot.health,
    automations: snapshot.automationStates.slice(0, 80),
    notableStates: snapshot.states
      .filter((state) => ["unavailable", "unknown"].includes(state.state) || state.entity_id.includes("battery"))
      .slice(0, 120),
    services: snapshot.services
  };

  return `You are analyzing a Home Assistant installation in read-only mode.
Return only valid JSON with this shape: {"suggestions":[...]}.
Each suggestion must include category, title, rationale, confidence, effort, risk, evidence, yaml, installSteps, rollbackSteps.
Use only these categories: ${constraints.categories.join(", ")}.
Limit to ${constraints.maxSuggestions} high-value suggestions.
Do not invent entity IDs. If YAML is not appropriate, use an empty string and explain UI steps.
Include copy-paste Home Assistant automation/script YAML when useful.

Snapshot:
${JSON.stringify(compactSnapshot, null, 2)}`;
}

async function callOpenAi(apiKey: string, model: string, prompt: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return body.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(apiKey: string, model: string, prompt: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!response.ok) throw new Error(`Anthropic request failed: ${response.status}`);
  const body = (await response.json()) as { content?: Array<{ text?: string }> };
  return body.content?.map((part) => part.text ?? "").join("\n") ?? "";
}

async function callGemini(apiKey: string, model: string, prompt: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
      })
    }
  );
  if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`);
  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? "";
}

function extractJson(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI response did not contain JSON");
  return match[0];
}
