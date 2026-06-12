import { describe, expect, it } from "vitest";
import { aiSuggestionListSchema } from "../../src/server/ai/schema.js";

describe("aiSuggestionListSchema", () => {
  it("accepts structured suggestions in the five supported categories", () => {
    const parsed = aiSuggestionListSchema.parse({
      suggestions: [
        {
          category: "Automation Opportunities",
          title: "Turn off lights after motion clears",
          rationale: "Motion and light entities are available for occupancy automation.",
          confidence: 0.8,
          effort: "medium",
          risk: "low",
          evidence: ["binary_sensor.kitchen_motion exists"],
          yaml: "alias: Kitchen motion lights",
          installSteps: ["Create a Home Assistant automation."],
          rollbackSteps: ["Delete the automation."]
        }
      ]
    });

    expect(parsed.suggestions).toHaveLength(1);
  });

  it("rejects unknown categories", () => {
    expect(() =>
      aiSuggestionListSchema.parse({
        suggestions: [
          {
            category: "Random",
            title: "Bad category",
            rationale: "This should fail validation.",
            confidence: 0.8,
            effort: "small",
            risk: "low",
            evidence: ["example"],
            yaml: "",
            installSteps: ["Do something."],
            rollbackSteps: ["Undo it."]
          }
        ]
      })
    ).toThrow();
  });
});
