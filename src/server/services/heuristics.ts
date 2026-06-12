import type { HaSnapshot, Suggestion } from "../../shared/types.js";
import type { AiSuggestionInput } from "../ai/schema.js";

export function generateHeuristicSuggestions(snapshot: HaSnapshot): AiSuggestionInput[] {
  const suggestions: AiSuggestionInput[] = [];
  const unavailable = snapshot.states.filter((state) => state.state === "unavailable");
  const lowBattery = snapshot.states.filter(
    (state) => state.attributes.device_class === "battery" && Number(state.state) <= 20
  );
  const motionSensors = snapshot.states.filter(
    (state) => state.entity_id.startsWith("binary_sensor.") && state.attributes.device_class === "motion"
  );
  const lights = snapshot.states.filter((state) => state.entity_id.startsWith("light."));
  const disabledAutomations = snapshot.automationStates.filter((state) => state.state === "off");

  if (motionSensors.length && lights.length) {
    suggestions.push({
      category: "Automation Opportunities",
      title: "Add occupancy-based lighting where motion sensors and lights coexist",
      rationale:
        "The installation has motion sensors and controllable lights. Rooms with both are good candidates for simple occupancy lighting with a timeout.",
      confidence: 0.72,
      effort: "medium",
      risk: "low",
      evidence: [
        `${motionSensors.length} motion sensor entities found`,
        `${lights.length} light entities found`
      ],
      yaml: `alias: Occupancy lighting candidate
description: Turn on a light when motion is detected, then turn it off after no motion.
trigger:
  - platform: state
    entity_id: ${motionSensors[0]?.entity_id ?? "binary_sensor.motion"}
    to: "on"
action:
  - service: light.turn_on
    target:
      entity_id: ${lights[0]?.entity_id ?? "light.example"}
  - wait_for_trigger:
      - platform: state
        entity_id: ${motionSensors[0]?.entity_id ?? "binary_sensor.motion"}
        to: "off"
        for: "00:05:00"
  - service: light.turn_off
    target:
      entity_id: ${lights[0]?.entity_id ?? "light.example"}
mode: restart`,
      installSteps: [
        "In Home Assistant, go to Settings > Automations & scenes > Create automation.",
        "Choose Edit in YAML, paste this YAML, then replace the candidate entities with the exact room entities.",
        "Save disabled first, test manually, then enable after confirming the timeout feels right."
      ],
      rollbackSteps: ["Disable or delete the new automation from Automations & scenes."]
    });
  }

  if (unavailable.length) {
    suggestions.push({
      category: "Reliability & Safety",
      title: "Review unavailable entities before building new automations on them",
      rationale:
        "Unavailable entities make automations brittle. Cleaning these up first reduces false triggers and failed conditions.",
      confidence: 0.9,
      effort: "small",
      risk: "low",
      evidence: unavailable.slice(0, 6).map((state) => `${state.entity_id} is unavailable`),
      yaml: "",
      installSteps: [
        "Go to Settings > Devices & services and inspect integrations related to the listed entities.",
        "Repair or remove stale devices before using those entities in new automations.",
        "If an entity is expected to go unavailable, add availability checks to automations that depend on it."
      ],
      rollbackSteps: ["No automation change is required; this is a maintenance recommendation."]
    });
  }

  if (lowBattery.length) {
    suggestions.push({
      category: "Reliability & Safety",
      title: "Create a low-battery notification automation",
      rationale:
        "Battery-powered sensors below 20% can silently break automations. A simple recurring notification prevents surprise failures.",
      confidence: 0.86,
      effort: "small",
      risk: "low",
      evidence: lowBattery.slice(0, 6).map((state) => `${state.entity_id} reports ${state.state}%`),
      yaml: `alias: Low battery sensor reminder
trigger:
  - platform: time
    at: "09:00:00"
condition:
  - condition: template
    value_template: >
      {{ states.sensor
        | selectattr('attributes.device_class', 'eq', 'battery')
        | selectattr('state', 'is_number')
        | map(attribute='state')
        | map('float')
        | select('le', 20)
        | list
        | count > 0 }}
action:
  - service: persistent_notification.create
    data:
      title: Low battery sensors
      message: Check battery sensors under 20%.
mode: single`,
      installSteps: [
        "Create a new automation in Home Assistant.",
        "Paste the YAML and adjust the notification service if you prefer mobile push notifications.",
        "Run the automation manually once to confirm the notification path."
      ],
      rollbackSteps: ["Delete the Low battery sensor reminder automation."]
    });
  }

  if (disabledAutomations.length) {
    suggestions.push({
      category: "Automation Improvements",
      title: "Audit disabled automations",
      rationale:
        "Disabled automations often represent abandoned ideas, broken dependencies, or seasonal rules that should be documented.",
      confidence: 0.8,
      effort: "small",
      risk: "low",
      evidence: disabledAutomations.slice(0, 8).map((state) => `${state.entity_id} is off`),
      yaml: "",
      installSteps: [
        "Open Settings > Automations & scenes and filter for disabled automations.",
        "Delete stale automations, rename seasonal ones, or add descriptions explaining when they should be re-enabled."
      ],
      rollbackSteps: ["No runtime change is required unless you choose to delete or enable automations."]
    });
  }

  suggestions.push({
    category: "Organization & Maintenance",
    title: "Keep generated suggestions read-only until reviewed in Home Assistant",
    rationale:
      "This appliance intentionally does not write to Home Assistant. Review YAML and installation steps before applying changes.",
    confidence: 1,
    effort: "small",
    risk: "low",
    evidence: [`Snapshot captured ${snapshot.states.length} filtered entities`],
    yaml: "",
    installSteps: [
      "Copy only the suggestions you understand.",
      "Prefer saving new automations disabled first.",
      "Test manually before enabling them permanently."
    ],
    rollbackSteps: ["Disable or delete any automation you manually add."]
  });

  return suggestions;
}

export function mergeSuggestions(ai: AiSuggestionInput[], heuristic: AiSuggestionInput[]): Omit<Suggestion, "id" | "runId" | "status" | "createdAt">[] {
  const seen = new Set<string>();
  return [...ai, ...heuristic].filter((suggestion) => {
    const key = `${suggestion.category}:${suggestion.title.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
