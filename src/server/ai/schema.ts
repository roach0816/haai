import { z } from "zod";
import { suggestionCategories } from "../../shared/types.js";

export const aiSuggestionSchema = z.object({
  category: z.enum(suggestionCategories),
  title: z.string().min(4).max(120),
  rationale: z.string().min(10).max(1000),
  confidence: z.number().min(0).max(1),
  effort: z.enum(["small", "medium", "large"]),
  risk: z.enum(["low", "medium", "high"]),
  evidence: z.array(z.string().min(3).max(240)).min(1).max(8),
  yaml: z.string().max(6000).default(""),
  installSteps: z.array(z.string().min(3).max(400)).min(1).max(12),
  rollbackSteps: z.array(z.string().min(3).max(400)).min(1).max(8)
});

export const aiSuggestionListSchema = z.object({
  suggestions: z.array(aiSuggestionSchema).max(20)
});

export type AiSuggestionInput = z.infer<typeof aiSuggestionSchema>;
