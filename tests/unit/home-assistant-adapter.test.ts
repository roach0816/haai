import { describe, expect, it } from "vitest";
import {
  selectHistoryEntities,
  summarizeErrorLog,
  summarizeHistory,
  summarizeLogbook
} from "../../src/server/adapters/homeAssistant.js";
import type { HaState } from "../../src/shared/types.js";

describe("Home Assistant diagnostics summarizers", () => {
  it("summarizes and redacts repeated error log patterns", () => {
    const patterns = summarizeErrorLog(`
2026-06-15 08:00:00 homeassistant.components.demo: Failed request to http://192.0.2.10/api?token=secret
2026-06-15 08:01:00 homeassistant.components.demo: Failed request to http://192.0.2.10/api?token=secret
    `);

    expect(patterns).toHaveLength(1);
    expect(patterns[0]).toMatchObject({
      source: "homeassistant.components.demo",
      count: 2,
      severity: "error"
    });
    expect(patterns[0].message).toContain("[url]");
    expect(patterns[0].message).not.toContain("192.0.2.10");
    expect(patterns[0].message).not.toContain("secret");
  });

  it("groups repeated logbook activity", () => {
    const patterns = summarizeLogbook([
      {
        entity_id: "light.kitchen",
        domain: "light",
        name: "Kitchen",
        message: "turned on",
        when: "2026-06-14T10:00:00Z"
      },
      {
        entity_id: "light.kitchen",
        domain: "light",
        name: "Kitchen",
        message: "turned on",
        when: "2026-06-14T11:00:00Z"
      }
    ]);

    expect(patterns).toEqual([
      {
        entityId: "light.kitchen",
        domain: "light",
        name: "Kitchen",
        message: "turned on",
        count: 2,
        firstSeen: "2026-06-14T10:00:00Z",
        lastSeen: "2026-06-14T11:00:00Z"
      }
    ]);
  });

  it("summarizes frequent history changes and unavailable states", () => {
    const patterns = summarizeHistory([
      [
        { entity_id: "switch.office", state: "off", last_changed: "2026-06-14T10:00:00Z", attributes: {} },
        { state: "on", last_changed: "2026-06-14T10:05:00Z", attributes: {} },
        { state: "off", last_changed: "2026-06-14T10:10:00Z", attributes: {} },
        { state: "unavailable", last_changed: "2026-06-14T10:15:00Z", attributes: {} }
      ]
    ]);

    expect(patterns[0]).toMatchObject({
      entityId: "switch.office",
      changeCount: 3,
      unavailableCount: 1,
      states: ["off", "on", "unavailable"]
    });
  });

  it("selects preferred entities for compact history collection", () => {
    const selected = selectHistoryEntities([
      state("light.kitchen", "off"),
      state("camera.driveway", "idle"),
      state("switch.old_plug", "unavailable"),
      state("sensor.temperature", "71")
    ]);

    expect(selected).toEqual(["switch.old_plug", "light.kitchen", "sensor.temperature"]);
  });
});

function state(entityId: string, value: string): HaState {
  return {
    entity_id: entityId,
    state: value,
    attributes: {}
  };
}
