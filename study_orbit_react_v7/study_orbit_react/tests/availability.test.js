import test from "node:test";
import assert from "node:assert/strict";
import {
  availableHours,
  studyWindows,
  starterWindows,
  presetErrors,
} from "../src/lib/availability.js";
import {
  useAvailability,
  suggestForAvailability,
  adaptToAvailability,
  flexibleErrors,
  planningWarnings,
} from "../src/lib/flexiblePlanner.js";
import {
  freshPhase,
  normalizeState,
  hoursBySubject,
  scheduledHours,
  slotsOverlap,
} from "../src/lib/planner.js";
import { migrateExport } from "../src/lib/legacy.js";
import { validateState } from "../server/storage.js";

/** @brief Build a reusable subject-free week and an independent two-subject phase. */
function fixture() {
  const preset = {
    id: "my-week",
    name: "Semester",
    notes: "Mornings at university",
    windows: [{ id: "mon", day: 0, start: 540, end: 1140, kind: "study" }],
  };
  const phase = useAvailability(
    {
      ...freshPhase(),
      name: "Exams",
      subjects: [
        { id: "math", name: "Math", tier: "SS" },
        { id: "law", name: "Law", tier: "B" },
      ],
      targetHours: { math: 8, law: 2 },
    },
    preset,
  );
  return { preset, phase };
}

test("preset capacity follows real windows (49, 42 and 55 hours) without a forced total", () => {
  assert.equal(availableHours(starterWindows("classic")), 49);
  assert.equal(availableHours(starterWindows("weekdays")), 42);
  assert.equal(
    availableHours([
      ...starterWindows("classic"),
      { id: "extra", day: 0, start: 1140, end: 1500, kind: "study" },
    ]),
    55,
  );
});

test("university changes subtract time, overlaps count once, and overnight weeks remain conflict-free", () => {
  const windows = [
    { id: "sunday", day: 6, start: 1380, end: 1560, kind: "study" },
    { id: "monday", day: 0, start: 0, end: 120, kind: "study" },
    { id: "lecture", day: 0, start: 30, end: 90, kind: "unavailable" },
  ];
  const usable = studyWindows(windows);
  assert.equal(availableHours(windows), 2);
  for (let i = 0; i < usable.length; i++)
    for (let j = i + 1; j < usable.length; j++)
      assert.equal(slotsOverlap(usable[i], usable[j]), false);
  const { preset } = fixture();
  preset.windows.push({ ...preset.windows[0], id: "duplicate" });
  assert.equal(availableHours(preset.windows), 10);
  preset.windows.push({
    id: "lecture",
    day: 0,
    start: 600,
    end: 660,
    kind: "unavailable",
  });
  assert.equal(availableHours(preset.windows), 9);
});

test("over-budget needs are fitted fairly and remain visible rather than blocking save", () => {
  const { phase } = fixture();
  phase.targetHours = { math: 12, law: 8 };
  const fitted = adaptToAvailability(phase);
  assert.equal(scheduledHours(fitted), 10);
  assert.deepEqual(hoursBySubject(fitted), { math: 6, law: 4 });
  assert.deepEqual(fitted.targetHours, { math: 12, law: 8 });
  assert.deepEqual(flexibleErrors(fitted), []);
  assert.ok(
    planningWarnings(fitted).some((warning) => warning.includes("exceed")),
  );
});

test("under-budget and zero requests keep spare capacity for later without inventing study time", () => {
  const { phase } = fixture();
  phase.targetHours = { math: 1, law: 0 };
  const fitted = adaptToAvailability(phase);
  assert.equal(scheduledHours(fitted), 0);
  assert.ok(
    planningWarnings(fitted).some((warning) => warning.includes("below 1.5h")),
  );
  fitted.targetHours = { math: 8, law: 2 };
  assert.equal(scheduledHours(adaptToAvailability(fitted)), 10);
  phase.targetHours = { math: 0, law: 0 };
  const empty = adaptToAvailability(phase);
  assert.equal(empty.slots.length, 0);
  assert.deepEqual(flexibleErrors(empty), []);
});

test("rank suggestion uses available time and all subjects receive a fair share", () => {
  const { phase } = fixture();
  const suggested = suggestForAvailability(phase);
  assert.ok(suggested.targetHours.math > suggested.targetHours.law);
  assert.equal(
    Object.values(suggested.targetHours).reduce((a, b) => a + b),
    10,
  );
});

test("refitting never moves fixed commitments, duplicates them, or changes a saved preset", () => {
  const { phase, preset } = fixture();
  const original = structuredClone(preset);
  phase.slots = [
    {
      id: "fixed",
      day: 0,
      start: 600,
      end: 660,
      subjectId: "law",
      fixed: true,
      protected: true,
    },
  ];
  const fitted = adaptToAvailability(phase);
  assert.deepEqual(
    fitted.slots.find((slot) => slot.id === "fixed"),
    phase.slots[0],
  );
  assert.deepEqual(flexibleErrors(fitted), []);
  assert.deepEqual(preset, original);
  fitted.availability.windows[0].end = 1000;
  assert.equal(phase.availability.windows[0].end, 1140);
  assert.equal(preset.windows[0].end, 1140);
});

test("changed constraints can reduce hours without changing needs or another phase", () => {
  const { phase } = fixture();
  const initial = adaptToAvailability(phase);
  const edited = structuredClone(initial);
  edited.availability.windows.push({
    id: "lecture",
    day: 0,
    start: 540,
    end: 840,
    kind: "unavailable",
  });
  assert.ok(
    flexibleErrors(edited).some((error) => error.includes("unavailable")),
  );
  const fitted = adaptToAvailability(edited);
  assert.equal(scheduledHours(fitted), 5);
  assert.equal(scheduledHours(initial), 10);
  assert.deepEqual(fitted.targetHours, initial.targetHours);
  assert.deepEqual(flexibleErrors(fitted), []);
  assert.deepEqual(adaptToAvailability(fitted).slots, fitted.slots);
});

test("presets survive state normalization and portable import; old state starts with none", () => {
  const { preset, phase } = fixture();
  const state = normalizeState({ phases: [phase], presets: [preset] });
  assert.deepEqual(normalizeState(migrateExport(state)).presets, [preset]);
  assert.deepEqual(validateState(state).presets, [preset]);
  assert.deepEqual(normalizeState({}).presets, []);
  assert.throws(
    () =>
      migrateExport({
        ...state,
        presets: [{ id: "bad", name: "Broken", windows: [{}] }],
      }),
    /Invalid preset/,
  );
  assert.throws(
    () =>
      validateState({
        ...state,
        presets: [{ id: "bad", name: "Broken", windows: [{}] }],
      }),
    /Invalid weekly preset/,
  );
  assert.ok(
    presetErrors({ ...preset, windows: [{ ...preset.windows[0], end: 500 }] })
      .length,
  );
});

test("sub-half-hour availability stays free and fixed/university conflicts remain errors", () => {
  const { phase } = fixture();
  phase.availability.windows[0].end = 563;
  const suggested = suggestForAvailability(phase);
  assert.equal(
    Math.round(
      Object.values(suggested.targetHours).reduce((a, b) => a + b) * 60,
    ),
    0,
  );
  const fitted = adaptToAvailability(suggested);
  assert.equal(Math.round(scheduledHours(fitted) * 60), 0);
  assert.deepEqual(flexibleErrors(fitted), []);
  phase.slots = [
    { id: "lab", day: 0, start: 540, end: 600, subjectId: "math", fixed: true },
  ];
  phase.availability.windows.push({
    id: "lecture",
    day: 0,
    start: 540,
    end: 570,
    kind: "unavailable",
  });
  assert.ok(
    flexibleErrors(phase).some((error) =>
      error.includes("fixed session conflicts"),
    ),
  );
});

test("new availability rows continue from the previous end, including overnight and limits", async () => {
  const { nextAvailabilityRange } = await import("../src/lib/availability.js");
  assert.deepEqual(nextAvailabilityRange([], 0), { start: 540, end: 660 });
  const rows = [
    { day: 0, start: 540, end: 660 },
    { day: 1, start: 500, end: 900 },
    { day: 0, start: 660, end: 780 },
  ];
  assert.deepEqual(nextAvailabilityRange(rows, 0), { start: 780, end: 900 });
  assert.deepEqual(nextAvailabilityRange([{ day: 0, end: 1500 }], 0, 60), {
    start: 1500,
    end: 1560,
  });
  assert.deepEqual(nextAvailabilityRange([{ day: 0, end: 2850 }], 0), {
    start: 2850,
    end: 2880,
  });
  assert.equal(nextAvailabilityRange([{ day: 0, end: 2880 }], 0), null);
});
