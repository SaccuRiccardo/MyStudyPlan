import test from "node:test";
import assert from "node:assert/strict";
import {
  copyAvailabilityRows,
  assignedTimetable,
} from "../src/lib/manualTimetable.js";
const phase = {
  slots: [],
  subjects: [],
  targetHours: {},
  availability: {
    windows: [
      { id: "a", day: 0, kind: "study", start: 540, end: 660 },
      { id: "b", day: 0, kind: "study", start: 660, end: 780 },
    ],
  },
};
test("availability copies exact touching periods without choosing subjects or hours", () => {
  const result = copyAvailabilityRows(phase);
  assert.deepEqual(
    result.slots.map((s) => [s.start, s.end, s.subjectId]),
    [
      [540, 660, ""],
      [660, 780, ""],
    ],
  );
  assert.deepEqual(phase.slots, []);
  assert.deepEqual(result.targetHours, {});
  assert.deepEqual(assignedTimetable(result).slots, []);
});
test("blocked periods and existing assignments are subtracted while locks and edits survive", () => {
  const input = structuredClone(phase);
  input.availability.windows.push({
    id: "blocked",
    day: 0,
    kind: "unavailable",
    start: 600,
    end: 630,
  });
  input.slots = [
    {
      id: "locked",
      day: 0,
      start: 660,
      end: 720,
      subjectId: "math",
      fixed: true,
    },
  ];
  const result = copyAvailabilityRows(input);
  assert.deepEqual(
    result.slots.find((s) => s.id === "locked"),
    input.slots[0],
  );
  assert.deepEqual(
    result.slots.filter((s) => !s.subjectId).map((s) => [s.start, s.end]),
    [
      [540, 600],
      [630, 660],
      [720, 780],
    ],
  );
  assert.deepEqual(assignedTimetable(result).slots, input.slots);
});
test("revisiting availability never duplicates placeholders or assigns overnight periods", () => {
  const input = {
    ...phase,
    availability: {
      windows: [{ id: "night", day: 6, kind: "study", start: 1500, end: 1620 }],
    },
  };
  const result = copyAvailabilityRows(copyAvailabilityRows(input));
  assert.equal(result.slots.length, 1);
  assert.deepEqual(
    result.slots.map((s) => [s.day, s.start, s.end, s.subjectId]),
    [[6, 1500, 1620, ""]],
  );
});
