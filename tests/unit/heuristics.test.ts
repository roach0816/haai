import { describe, expect, it } from "vitest";
import type { HaSnapshot } from "../../src/shared/types.js";
import { generateHeuristicSuggestions } from "../../src/server/services/heuristics.js";

describe("generateHeuristicSuggestions", () => {
  it("creates reliability and automation suggestions from common HA entities", () => {
    const snapshot: HaSnapshot = {
      capturedAt: "2026-06-12T12:00:00.000Z",
      config: {},
      services: [],
      components: ["automation", "light"],
      automationStates: [{ entity_id: "automation.old_rule", state: "off", attributes: {} }],
      diagnostics: {
        errorLogPatterns: [],
        logbookPatterns: [],
        historyPatterns: [],
        collectionWarnings: []
      },
      health: { unavailableCount: 1, unknownCount: 0, batteryLowCount: 1 },
      states: [
        {
          entity_id: "binary_sensor.kitchen_motion",
          state: "off",
          attributes: { device_class: "motion" }
        },
        { entity_id: "light.kitchen", state: "off", attributes: {} },
        { entity_id: "sensor.door_battery", state: "12", attributes: { device_class: "battery" } },
        { entity_id: "switch.old_plug", state: "unavailable", attributes: {} }
      ]
    };

    const suggestions = generateHeuristicSuggestions(snapshot);
    expect(suggestions.map((item) => item.category)).toContain("Automation Opportunities");
    expect(suggestions.map((item) => item.category)).toContain("Reliability & Safety");
  });

  it("creates a reliability suggestion from repeated Home Assistant log errors", () => {
    const snapshot: HaSnapshot = {
      capturedAt: "2026-06-12T12:00:00.000Z",
      config: {},
      services: [],
      components: ["automation"],
      automationStates: [],
      diagnostics: {
        errorLogPatterns: [
          {
            source: "homeassistant.components.demo",
            message: "Failed to update device",
            count: 4,
            severity: "error"
          }
        ],
        logbookPatterns: [],
        historyPatterns: [],
        collectionWarnings: []
      },
      health: { unavailableCount: 0, unknownCount: 0, batteryLowCount: 0 },
      states: []
    };

    const suggestions = generateHeuristicSuggestions(snapshot);
    expect(suggestions.map((item) => item.title)).toContain("Investigate repeated Home Assistant log errors");
  });
});
