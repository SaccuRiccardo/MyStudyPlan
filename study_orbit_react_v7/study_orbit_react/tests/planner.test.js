import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPreset,
  autoFill,
  freshPhase,
  hoursBySubject,
  suggestHours,
  validatePhase,
} from "../src/lib/planner.js";
import { samplePhases } from "./fixtures/samplePhases.js";
import { getSchedulePosition, HANDOFF_MINUTES } from "../src/lib/time.js";

const subject = (id, tier = "A") => ({ id, name: id, tier, color: "#117c77" });

test("synthetic sample phases are valid and preserve protected commitments", () => {
  const phases = samplePhases();
  assert.equal(phases.length, 2);
  for (const phase of phases) {
    assert.deepEqual(validatePhase(phase), []);
    assert.equal(phase.slots.filter((slot) => slot.protected).length, 2);
    assert.equal(phase.slots.length, 21);
  }
});

test("tier allocation and auto-fill respect selected hours", () => {
  const p = freshPhase();
  p.name = "Test phase";
  p.totalTarget = 49;
  p.subjects = [subject("hard", "SS"), subject("easy", "B")];
  let d = suggestHours(p);
  assert.equal(d.targetHours.hard + d.targetHours.easy, 49);
  assert.ok(d.targetHours.hard > d.targetHours.easy);
  d = applyPreset(d, "classic");
  assert.deepEqual(validatePhase(d), []);
  const totals = hoursBySubject(d);
  assert.equal(totals.hard, d.targetHours.hard);
});

test("two adjacent blocks reserve first 10 minutes of next block for planning", () => {
  const p = {
    subjects: [subject("A"), subject("B")],
    slots: [
      { id: "first", day: 0, start: 840, end: 960, subjectId: "A" },
      { id: "second", day: 0, start: 960, end: 1080, subjectId: "B" },
    ],
  };
  const handoff = getSchedulePosition(p, new Date(2026, 10, 2, 16, 4));
  assert.equal(handoff.mode, "handoff");
  assert.equal(handoff.event.slot.id, "first");
  const studying = getSchedulePosition(p, new Date(2026, 10, 2, 16, 11));
  assert.equal(studying.mode, "study");
  assert.equal(studying.event.slot.id, "second");
  assert.equal(studying.event.actualStart.getHours(), 16);
  assert.equal(studying.event.actualStart.getMinutes(), 10);
});

test("overnight plan belongs to preceding study day", () => {
  const p = {
    subjects: [subject("A")],
    slots: [{ id: "late", day: 0, start: 1500, end: 1620, subjectId: "A" }],
  };
  const position = getSchedulePosition(p, new Date(2026, 10, 3, 1, 30)); // Tuesday morning, Monday plan
  assert.equal(position.mode, "study");
  assert.equal(position.event.base.getDay(), 1);
});

test("planner rejects cross-midnight overlaps", () => {
  const p = {
    name: "Overlapping",
    subjects: [subject("A")],
    totalTarget: 4,
    targetHours: { A: 4 },
    slots: [
      { id: "mon", day: 0, start: 1380, end: 1560, subjectId: "A" },
      { id: "tue", day: 1, start: 60, end: 120, subjectId: "A" },
    ],
  };
  assert.ok(validatePhase(p).some((message) => message.includes("overlap")));
});

test("v5 exports without a timetable fail without inventing user data", async () => {
  const { migrateExport } = await import("../src/lib/legacy.js");
  const legacy = {
    phase: "exams",
    blocks: { test: { done: true } },
    handoffs: { math: { text: "Next problem" } },
    audioItems: [],
  };
  assert.throws(() => migrateExport(legacy), /no timetable/);
});

test("reapplying a preset preserves mandatory protected slots", () => {
  const phase = samplePhases()[0];
  const protectedBefore = phase.slots
    .filter((s) => s.protected)
    .map((s) => `${s.day}-${s.start}-${s.end}-${s.subjectId}`);
  const after = applyPreset(phase, "night");
  const protectedAfter = after.slots
    .filter((s) => s.protected)
    .map((s) => `${s.day}-${s.start}-${s.end}-${s.subjectId}`);
  assert.deepEqual(protectedAfter.sort(), protectedBefore.sort());
});
