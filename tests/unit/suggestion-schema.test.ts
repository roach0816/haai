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

  it("normalizes common AI provider formatting mistakes", () => {
    const parsed = aiSuggestionListSchema.parse({
      suggestions: [
        {
          category: "Automation Opportunities",
          title: "Coordinate office lights",
          rationale: "The office has related motion and lighting entities that can work together.",
          confidence: "82%",
          effort: "low",
          risk: "low",
          evidence: "binary_sensor.office_motion and light.office are in the same area",
          yaml: "alias: Office lights",
          installSteps: "Create the automation in Home Assistant.",
          rollbackSteps: "Delete the automation."
        }
      ]
    });

    expect(parsed.suggestions[0].confidence).toBe(0.82);
    expect(parsed.suggestions[0].effort).toBe("small");
    expect(parsed.suggestions[0].evidence).toEqual([
      "binary_sensor.office_motion and light.office are in the same area"
    ]);
    expect(parsed.suggestions[0].installSteps).toEqual(["Create the automation in Home Assistant."]);
  });
});
