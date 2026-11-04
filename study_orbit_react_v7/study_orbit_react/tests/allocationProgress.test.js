import test from "node:test";
import assert from "node:assert/strict";
import { allocationProgress } from "../src/lib/allocationProgress.js";
import { progressForWeek } from "../src/lib/progress.js";
import { blockKey } from "../src/lib/time.js";
const phase = {
  id: "p",
  subjects: [
    { id: "math", tier: "SS" },
    { id: "writing", tier: "B" },
  ],
  targetHours: { math: 6, writing: 2 },
  slots: [
    { id: "a", subjectId: "math", day: 0, start: 540, end: 660 },
    { id: "b", subjectId: "math", day: 1, start: 540, end: 660 },
    { id: "c", subjectId: "writing", day: 0, start: 660, end: 780 },
  ],
};
test("marked blocks grow completion by hours and undo restores the previous state", () => {
  const date = new Date(2026, 10, 2);
  const blocks = {};
  const calculate = () =>
    allocationProgress(phase, progressForWeek(phase, blocks, date).bySubject);
  assert.equal(calculate().percent, 0);
  blocks[blockKey("p", date, "a")] = { done: true };
  let result = calculate();
  assert.equal(result.rows[0].percent, 50);
  assert.equal(result.rows[1].percent, 0);
  assert.equal(result.done, 2);
  assert.equal(result.total, 6);
  assert.equal(result.rows[0].goal, 6);
  assert.equal(result.rows[0].subject.tier, "SS");
  blocks[blockKey("p", date, "a")].done = false;
  assert.equal(calculate().percent, 0);
});
test("completing all scheduled sessions does not imply an underfilled goal was reached", () => {
  const result = allocationProgress(phase, { math: 4, writing: 2 });
  assert.equal(result.percent, 100);
  assert.equal(result.complete, true);
  assert.equal(result.rows[0].complete, true);
  assert.equal(result.rows[0].goal - result.rows[0].scheduled, 2);
});
test("different weeks and phases do not receive each others completion", () => {
  const date = new Date(2026, 10, 2);
  const blocks = { [blockKey("p", date, "a")]: { done: true } };
  assert.equal(
    progressForWeek(phase, blocks, new Date(2026, 10, 9)).markedHours,
    0,
  );
  assert.equal(
    progressForWeek({ ...phase, id: "other" }, blocks, date).markedHours,
    0,
  );
});
test("zero schedules and stale completion do not produce NaN or false completion", () => {
  const empty = allocationProgress({ ...phase, slots: [] }, { math: 50 });
  assert.equal(empty.percent, 0);
  assert.equal(empty.complete, false);
  const result = allocationProgress(phase, {
    math: 999,
    writing: -3,
    unknown: 100,
  });
  assert.equal(result.done, 4);
  assert.equal(result.rows[1].percent, 0);
  assert.equal(allocationProgress(phase, { math: NaN }).done, 0);
});
