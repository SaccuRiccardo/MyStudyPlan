import test from "node:test";
import assert from "node:assert/strict";
import {
  autoFill,
  clone,
  normalizeState,
  suggestHours,
  validatePhase,
} from "../src/lib/planner.js";
import { getSchedulePosition, blockKey } from "../src/lib/time.js";
import { samplePhases } from "./fixtures/samplePhases.js";
import { migrateExport } from "../src/lib/legacy.js";
import { saveSubject, deleteSubject } from "../src/lib/subjects.js";

/** @brief Build a small feasible schedule shared by regression cases. */
function phase() {
  return {
    id: "p",
    name: "Exams",
    subjects: [{ id: "math", name: "Math", tier: "SS" }],
    totalTarget: 2,
    targetHours: { math: 2 },
    slots: [{ id: "one", day: 0, start: 540, end: 660, subjectId: "math" }],
  };
}

test("three-way and weekly-boundary overlaps report errors without crashing", () => {
  const p = phase();
  p.slots.push({ ...p.slots[0], id: "two" }, { ...p.slots[0], id: "three" });
  assert.ok(validatePhase(p).some((error) => error.includes("overlap")));
  p.slots = [
    { ...p.slots[0], day: 6, start: 1440, end: 1560 },
    { ...p.slots[0], id: "next", day: 0, start: 60, end: 180 },
  ];
  assert.ok(validatePhase(p).some((error) => error.includes("overlap")));
});

test("legacy repeated block IDs migrate progress and produce stable unique keys", () => {
  const p = phase();
  p.slots.push({ ...p.slots[0], day: 1 });
  const state = normalizeState({
    phases: [p],
    phase: "p",
    blocks: { "p:2026-11-03:one": { done: true } },
  });
  assert.equal(new Set(state.phases[0].slots.map((s) => s.id)).size, 2);
  assert.equal(
    state.blocks[
      blockKey("p", new Date(2026, 10, 3), state.phases[0].slots[1].id)
    ].done,
    true,
  );
  assert.deepEqual(normalizeState(state), state);
  for (const p of samplePhases())
    assert.equal(new Set(p.slots.map((s) => s.id)).size, 21);
});

test("short sessions entirely consumed by handoff do not create phantom study or handoff", () => {
  const p = phase();
  p.slots = [
    { id: "first", day: 0, start: 900, end: 960 },
    { id: "short", day: 0, start: 960, end: 965 },
    { id: "third", day: 0, start: 965, end: 1020 },
  ];
  const atEnd = getSchedulePosition(p, new Date(2026, 10, 2, 16, 7));
  assert.equal(atEnd.event.slot.id, "first");
  const after = getSchedulePosition(p, new Date(2026, 10, 2, 16, 11));
  assert.equal(after.mode, "study");
  assert.equal(after.event.slot.id, "third");
  assert.equal(after.event.actualStart.getMinutes(), 10);
});

test("subject identity and notes are shared while phase settings and copies remain independent", () => {
  const first = phase(),
    second = clone(first);
  second.id = "second";
  second.subjects[0].tier = "B";
  const state = normalizeState({
    phases: [first, second],
    handoffs: { math: { text: "Exercise 8" } },
  });
  saveSubject(state, { ...state.subjects[0], name: "Mathematics", tier: "S" });
  assert.equal(state.phases[1].subjects[0].name, "Mathematics");
  assert.equal(state.phases[1].subjects[0].tier, "B");
  assert.equal(state.handoffs.math.text, "Exercise 8");
  state.phases[0].slots[0].start = 500;
  assert.equal(state.phases[1].slots[0].start, 540);
  deleteSubject(state, "math");
  assert.equal(state.phases[1].slots.length, 0);
  assert.equal(state.subjects.length, 0);
});

test("allocation suggestions include mandatory hours but manual priorities are not enforced", () => {
  const p = phase();
  p.slots[0].fixed = true;
  p.subjects.push({ id: "other", name: "Other", tier: "B" });
  p.totalTarget = 3;
  const suggested = suggestHours(p);
  assert.ok(suggested.targetHours.math >= 2);
  assert.equal(
    Object.values(suggested.targetHours).reduce((a, b) => a + b),
    3,
  );
  p.slots = [];
  p.targetHours = { math: 0, other: 3 };
  p.slots = [{ id: "other", day: 0, start: 540, end: 720, subjectId: "other" }];
  assert.deepEqual(validatePhase(p), []);
});

test("auto-fill preserves fixed commitments and capacity when requested hours change", () => {
  const p = phase();
  p.targetHours.math = 1;
  const filled = autoFill(p);
  assert.equal(filled.slots[0].end, 600);
  filled.targetHours.math = 2;
  const refilled = autoFill(filled);
  assert.equal(refilled.slots.at(-1).end, 660);
  assert.equal(p.slots[0].end, 660);
});

test("malformed and future imports fail before normalization can discard user data", () => {
  assert.throws(() => migrateExport({ version: 8, phases: [] }), /Unsupported/);
  assert.throws(
    () => migrateExport({ version: 7, phases: [{ id: "broken" }] }),
    /Invalid/,
  );
});

test("progress is isolated by phase and week and supports undo", async () => {
  const { progressForWeek } = await import("../src/lib/progress.js");
  const p = phase(),
    date = new Date(2026, 10, 2);
  const blocks = { [blockKey(p.id, date, "one")]: { done: true } };
  assert.equal(progressForWeek(p, blocks, date).markedHours, 2);
  assert.equal(
    progressForWeek(p, blocks, new Date(2026, 10, 9)).markedHours,
    0,
  );
  assert.equal(
    progressForWeek({ ...p, id: "other" }, blocks, date).markedHours,
    0,
  );
  blocks[blockKey(p.id, date, "one")].done = false;
  assert.equal(progressForWeek(p, blocks, date).markedHours, 0);
});

test("editing an auto-filled piece prevents deleted capacity being resurrected", async () => {
  const { forgetAutoFillGroup } = await import("../src/lib/planner.js");
  const p = phase();
  p.subjects.push({ id: "other", name: "Other", tier: "B" });
  p.targetHours = { math: 1, other: 1 };
  const filled = autoFill(p);
  assert.equal(filled.slots.length, 2);
  const removed = filled.slots[0];
  forgetAutoFillGroup(filled, removed.id);
  filled.slots = filled.slots.filter((slot) => slot.id !== removed.id);
  filled.targetHours = { math: 2, other: 0 };
  const after = autoFill(filled);
  assert.equal(after.slots[0].start, 600);
  assert.equal(after.slots.at(-1).end, 660);
});
