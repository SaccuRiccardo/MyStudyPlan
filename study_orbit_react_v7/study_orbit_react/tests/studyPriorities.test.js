import test from "node:test";
import assert from "node:assert/strict";
import {
  flexibleStudySubject,
  freshPhase,
  hoursBySubject,
  normalizeState,
  priorityLabel,
} from "../src/lib/planner.js";
import {
  useAvailability,
  adaptToAvailability,
  suggestForAvailability,
} from "../src/lib/flexiblePlanner.js";
import { migrateExport } from "../src/lib/legacy.js";
import { validateState } from "../server/storage.js";
import { saveSubject } from "../src/lib/subjects.js";
import { blockKey } from "../src/lib/time.js";
import { progressForWeek } from "../src/lib/progress.js";

test("effort labels preserve saved priorities and their relative allocation", () => {
  const tiers = ["SS", "S", "A", "B"];
  const phase = useAvailability(
    {
      ...freshPhase(),
      name: "Existing plan",
      subjects: tiers.map((tier) => ({ id: tier, name: tier, tier })),
    },
    {
      name: "Week",
      windows: [{ id: "monday", day: 0, start: 540, end: 1140, kind: "study" }],
    },
  );
  const restored = normalizeState(
    JSON.parse(JSON.stringify({ phases: [phase] })),
  );
  assert.deepEqual(
    restored.phases[0].subjects.map((subject) => subject.tier),
    tiers,
  );
  assert.deepEqual(tiers.map(priorityLabel), [
    "Intensive",
    "High effort",
    "Steady",
    "Maintenance",
  ]);
  assert.deepEqual(suggestForAvailability(restored.phases[0]).targetHours, {
    SS: 4,
    S: 3,
    A: 2,
    B: 1,
  });
});

test("flexible study survives export/import, rename and refill under its own allocation", () => {
  const flex = flexibleStudySubject();
  const phase = useAvailability(
    {
      ...freshPhase(),
      name: "Mixed week",
      subjects: [{ id: "math", name: "Math", tier: "S" }, flex],
      targetHours: { math: 2, [flex.id]: 2 },
    },
    {
      name: "Week",
      windows: [{ id: "monday", day: 0, start: 540, end: 780, kind: "study" }],
    },
  );
  const filled = adaptToAvailability(phase);
  assert.deepEqual(hoursBySubject(filled), { math: 2, [flex.id]: 2 });
  const state = normalizeState(
    migrateExport(
      JSON.parse(JSON.stringify(normalizeState({ phases: [filled] }))),
    ),
  );
  validateState(state);
  assert.equal(
    state.phases[0].subjects.find((subject) => subject.id === flex.id).kind,
    "flexible",
  );
  const shared = state.subjects.find((subject) => subject.id === flex.id);
  saveSubject(state, { ...shared, name: "Independent study" });
  assert.equal(
    state.phases[0].subjects.find((subject) => subject.id === flex.id).kind,
    "flexible",
  );
  assert.deepEqual(adaptToAvailability(state.phases[0]).slots, filled.slots);
});

test("completed flexible study is not credited to a named course", () => {
  const flex = flexibleStudySubject();
  const phase = {
    id: "week",
    subjects: [{ id: "math" }, flex],
    slots: [
      { id: "flex", day: 0, start: 540, end: 660, subjectId: flex.id },
      { id: "math", day: 1, start: 540, end: 660, subjectId: "math" },
    ],
  };
  const monday = new Date(2026, 10, 2);
  const result = progressForWeek(
    phase,
    { [blockKey(phase.id, monday, "flex")]: { done: true } },
    monday,
  );
  assert.equal(result.markedHours, 2);
  assert.deepEqual(result.bySubject, { [flex.id]: 2 });
});
