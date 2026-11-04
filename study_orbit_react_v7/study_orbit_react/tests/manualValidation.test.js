import test from "node:test";
import assert from "node:assert/strict";
import {
  flexibleErrors,
  planningWarnings,
} from "../src/lib/flexiblePlanner.js";
import {
  copyAvailabilityRows,
  syncAvailabilityRows,
  splitTimetableRow,
  assignedTimetable,
} from "../src/lib/manualTimetable.js";
const make = () => ({
  name: "Manual week",
  subjects: [{ id: "math", name: "Mathematics", tier: "SS" }],
  targetHours: { math: 10 },
  slots: [],
  availability: {
    windows: [
      { id: "morning", kind: "study", day: 0, start: 600, end: 780 },
      { id: "evening", kind: "study", day: 0, start: 900, end: 1080 },
    ],
  },
});
test("edits to availability synchronize the timetable without overwriting manual choices", () => {
  let phase = copyAvailabilityRows(make());
  phase.slots[0].subjectId = "math";
  const id = phase.slots[0].id;
  phase.availability.windows[1].end = 1140;
  phase = syncAvailabilityRows(phase);
  assert.equal(phase.slots.find((s) => s.id === id).subjectId, "math");
  assert.equal(phase.slots.find((s) => !s.subjectId).end, 1140);
  assert.equal(syncAvailabilityRows(phase), phase);
});
test("split preserves the original choice and all available minutes without assigning the new part", () => {
  const phase = copyAvailabilityRows(make());
  phase.slots[0].subjectId = "math";
  const result = splitTimetableRow(phase, phase.slots[0].id);
  assert.equal(result.slots.length, 3);
  const parts = result.slots.filter((s) => s.start >= 600 && s.end <= 780);
  assert.equal(
    parts.reduce((n, s) => n + s.end - s.start, 0),
    180,
  );
  assert.equal(parts[0].subjectId, "math");
  assert.equal(parts[1].subjectId, "");
});
test("manual timetable saves despite goals differing by two, three, four or more hours", () => {
  for (const difference of [-8, -4, -3, -2, 2, 3, 4, 8]) {
    const phase = make();
    phase.slots = phase.availability.windows.map((w, i) => ({
      ...w,
      id: `s${i}`,
      subjectId: "math",
    }));
    phase.targetHours.math = 6 + difference;
    if (phase.targetHours.math < 0) phase.targetHours.math = 0;
    assert.deepEqual(flexibleErrors(phase), []);
    assert.ok(
      planningWarnings(phase).some((w) =>
        w.includes("matching the goal is optional"),
      ),
    );
  }
});
test("overlaps, overnight mistakes and blocked time identify the session and the remedy", () => {
  const phase = make();
  phase.slots = [
    { id: "a", day: 0, start: 600, end: 780, subjectId: "math" },
    { id: "b", day: 0, start: 720, end: 800, subjectId: "math" },
  ];
  assert.ok(
    flexibleErrors(phase).some(
      (e) =>
        e.includes("Monday") &&
        e.includes("Mathematics") &&
        e.includes("overlaps") &&
        e.includes("shorten"),
    ),
  );
  phase.slots[1].end = 600;
  assert.ok(flexibleErrors(phase).some((e) => e.includes("+1 day")));
  phase.slots.pop();
  phase.availability.windows.push({
    id: "blocked",
    kind: "unavailable",
    day: 0,
    start: 660,
    end: 720,
  });
  assert.ok(
    flexibleErrors(phase).some(
      (e) =>
        e.includes("unavailable") &&
        e.includes("11:00") &&
        e.includes("shorten"),
    ),
  );
});
test("extra manual hours outside the initial study window are warnings, not overwritten sessions", () => {
  const phase = make();
  phase.slots = [
    { id: "extra", day: 1, start: 600, end: 740, subjectId: "math" },
  ];
  assert.deepEqual(flexibleErrors(phase), []);
  assert.ok(
    planningWarnings(phase).some(
      (w) => w.includes("outside") && w.includes("save this extra time"),
    ),
  );
  assert.deepEqual(assignedTimetable(phase).slots, phase.slots);
});
