import { z } from "zod";
import { suggestionCategories } from "../../shared/types.js";

const confidenceSchema = z.preprocess((value) => {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return value;

  const normalized = value.trim().toLowerCase();
  if (normalized.endsWith("%")) {
    const percent = Number(normalized.slice(0, -1));
    return Number.isFinite(percent) ? percent / 100 : value;
  }

  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) {
    return numeric > 1 && numeric <= 100 ? numeric / 100 : numeric;
  }

  if (normalized === "high") return 0.85;
  if (normalized === "medium") return 0.6;
  if (normalized === "low") return 0.35;
  return value;
}, z.number().min(0).max(1));

const effortSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === "low" || normalized === "easy") return "small";
  if (normalized === "moderate") return "medium";
  if (normalized === "high" || normalized === "hard") return "large";
  return normalized;
}, z.enum(["small", "medium", "large"]));

const stringArraySchema = (maxItems: number, maxLength: number) =>
  z.preprocess((value) => {
    if (Array.isArray(value)) return value.map((item) => normalizeBoundedString(item, maxLength));
    if (typeof value === "string" && value.trim()) return [normalizeBoundedString(value, maxLength)];
    return value;
  }, z.array(z.string().min(3).max(maxLength)).min(1).max(maxItems));

function normalizeBoundedString(value: unknown, maxLength: number): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
}

export const aiSuggestionSchema = z.object({
  category: z.enum(suggestionCategories),
  title: z.string().min(4).max(120),
  rationale: z.string().min(10).max(1000),
  confidence: confidenceSchema,
  effort: effortSchema,
  risk: z.enum(["low", "medium", "high"]),
  evidence: stringArraySchema(8, 240),
  yaml: z.string().max(6000).default(""),
  installSteps: stringArraySchema(12, 400),
  rollbackSteps: stringArraySchema(8, 400)
});

export const aiSuggestionListSchema = z.object({
  suggestions: z.array(aiSuggestionSchema).max(20)
});

export type AiSuggestionInput = z.infer<typeof aiSuggestionSchema>;
