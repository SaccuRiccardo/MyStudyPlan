import { DEFAULT_POMODORO } from "../src/lib/pomodoro.js";
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeState } from "../src/lib/planner.js";
import { migrateExport } from "../src/lib/legacy.js";
import {
  journalEntriesForSubject,
  journalValidationError,
  normalizeJournal,
  preserveJournalHistory,
  saveJournalEntry,
} from "../src/lib/studyJournal.js";

const firstSave = "2026-11-02T14:00:00.000Z";
const laterSave = "2026-11-04T09:00:00.000Z";
const context = {
  subjectId: "math", subjectName: "Mathematics", phaseId: "semester",
  phaseName: "Autumn semester", date: "2026-11-02", slotId: "morning",
  start: 540, end: 660,
};
const blank = () => normalizeState({});
const legacy = () => normalizeState({
  phases: [{
    id: "semester", name: "Autumn semester", targetHours: { math: 4 },
    subjects: [{ id: "math", name: "Mathematics" }],
    slots: [{ id: "morning", subjectId: "math", day: 0, start: 540, end: 660 }],
  }],
  blocks: {
    "semester:2026-11-02:morning": { done: true, goal: "Chapter 1" },
    "semester:2026-11-09:morning": { goal: "Chapter 2" },
    "semester:2026-11-16:morning": { done: false, goal: "" },
    "semester:bad-date:morning": { done: true },
  },
});

test("dated sessions retain work, completion, goals and next steps independently across weeks", () => {
  const state = blank();
  const first = saveJournalEntry(state, context, {
    work: "Proved the convergence theorem", done: true,
    goal: "Chapter 1", nextStep: "Practise exercise 5",
  }, firstSave);
  const second = saveJournalEntry(state, { ...context, date: "2026-11-09" }, {
    work: "Solved exercise 5", nextStep: "Review the proof",
  }, laterSave);
  assert.notEqual(first.id, second.id);
  assert.equal(state.blocks[first.id].done, true);
  assert.equal(state.blocks[second.id].done, false);
  assert.equal(state.journal[first.id].work, "Proved the convergence theorem");
  assert.equal(state.handoffs.math.text, "Review the proof");
  assert.equal(journalEntriesForSubject(state, "math").length, 2);
  assert.equal(journalValidationError(state.journal), null);
});

test("late next-step edits update the next session while preserving each saved revision", () => {
  const state = blank();
  const first = saveJournalEntry(state, context, { work: "Read chapter 1" }, firstSave);
  const amended = saveJournalEntry(state, context, { nextStep: "Recall chapter 1" }, laterSave);
  assert.equal(amended.revisions.length, 2);
  assert.equal(amended.revisions[0].work, "Read chapter 1");
  assert.equal(amended.revisions[0].nextStep, "");
  assert.equal(amended.revisions[1].savedAt, laterSave);
  assert.equal(state.handoffs.math.text, "Recall chapter 1");
  const unchanged = saveJournalEntry(state, context, { nextStep: "Recall chapter 1" }, "2026-11-05T10:00:00Z");
  assert.equal(unchanged.revisions.length, 2);
  assert.equal(unchanged.updatedAt, laterSave);
  assert.equal(first.revisions.length, 1, "Previous immutable snapshot must remain unchanged");
});

test("editing earlier work does not replace a newer shared next-session instruction", () => {
  const state = blank();
  saveJournalEntry(state, context, { work: "Read chapter 1", nextStep: "Chapter 2" }, firstSave);
  saveJournalEntry(state, { ...context, date: "2026-11-09" }, { nextStep: "Chapter 3" }, laterSave);
  saveJournalEntry(state, context, { work: "Read chapter 1 and took notes" }, laterSave);
  assert.equal(state.handoffs.math.text, "Chapter 3");
  saveJournalEntry(state, context, { nextStep: "" }, laterSave);
  assert.equal(state.handoffs.math.text, "", "An explicit blank next step clears the shared plan");
});

test("saved history keeps original subject, phase and times after timetable edits", () => {
  const state = blank();
  saveJournalEntry(state, context, { work: "Limits" }, firstSave);
  const edited = saveJournalEntry(state, {
    ...context, subjectName: "Advanced Mathematics", phaseName: "Renamed phase",
    start: 720, end: 780,
  }, { work: "Limits and continuity" }, laterSave);
  assert.equal(edited.subjectName, "Mathematics");
  assert.equal(edited.phaseName, "Autumn semester");
  assert.equal(edited.start, 540);
  assert.equal(edited.end, 660);
});

test("standalone diary entries need no scheduled session or phase", () => {
  const state = blank();
  const entry = saveJournalEntry(state, {
    ...context, phaseId: null, phaseName: "", slotId: null, start: null, end: null,
  }, { work: "Unscheduled recall practice" }, firstSave);
  assert.equal(entry.phaseId, null);
  assert.equal(entry.slotId, null);
  assert.equal(entry.start, null);
  assert.deepEqual(state.blocks, {});
  assert.deepEqual(state.handoffs, {});
  const empty = saveJournalEntry(state, {
    subjectId: "math", subjectName: "Mathematics", date: "2026-11-03",
  }, {}, firstSave);
  assert.equal(empty.revisions.length, 1);
  assert.notEqual(entry.id, empty.id);
});

test("legacy completion and goal history is visible without inventing study notes or save times", () => {
  const state = legacy();
  const entries = journalEntriesForSubject(state, "math");
  assert.equal(entries.length, 2);
  assert.equal(entries[0].date, "2026-11-09");
  assert.equal(entries[1].done, true);
  assert.equal(entries[1].work, "");
  assert.equal(entries[1].updatedAt, null);
  assert.deepEqual(state.journal, {}, "Reading history must not mutate the workspace");
  const saved = saveJournalEntry(state, context, { work: "Reviewed chapter 1" }, laterSave);
  assert.equal(saved.goal, "Chapter 1");
  assert.equal(saved.done, true);
  assert.equal(saved.revisions.length, 2);
  assert.equal(saved.revisions[0].savedAt, null);
  assert.equal(saved.revisions[0].work, "");
  assert.equal(journalEntriesForSubject(state, "math").length, 2, "A stored entry supersedes its legacy source");
});

test("preserving older history survives source slot, subject and phase removal", () => {
  const state = legacy();
  preserveJournalHistory(state);
  assert.equal(Object.keys(state.journal).length, 2);
  state.phases = [];
  state.subjects = [];
  const entries = journalEntriesForSubject(state, "math");
  assert.equal(entries.length, 2);
  assert.equal(entries[1].subjectName, "Mathematics");
  assert.equal(journalValidationError(state.journal), null);
  const saved = saveJournalEntry(state, entries[1], { work: "Review notes" }, laterSave);
  assert.equal(saved.revisions[0].goal, "Chapter 1");
  assert.equal(saved.revisions[0].savedAt, null);
});

test("old states default sound settings off and imports retain all new state fields", () => {
  const old = normalizeState({ version: 6 });
  assert.deepEqual(old.journal, {});
  assert.deepEqual(old.settings, { sessionStartSound: false, sessionEndSound: false, soundVolume: 0.8, customSound: null, pomodoro: { ...DEFAULT_POMODORO } });
  const state = blank();
  state.settings = { sessionStartSound: true, sessionEndSound: false, soundVolume: 0.8, customSound: null, pomodoro: { ...DEFAULT_POMODORO } };
  saveJournalEntry(state, context, { work: "Exercises", nextStep: "Proofs" }, firstSave);
  saveJournalEntry(state, context, { done: true }, laterSave);
  const restored = normalizeState(migrateExport(JSON.parse(JSON.stringify(state))));
  assert.deepEqual(restored, state);
  restored.journal[Object.keys(restored.journal)[0]].work = "Changed imported copy";
  assert.notDeepEqual(restored.journal, state.journal);
});

test("normalization keeps valid records while malformed journal content is rejected by storage validation", () => {
  const state = blank();
  const entry = saveJournalEntry(state, context, { work: "Notes" }, firstSave);
  const broken = { ...entry, id: "broken", date: "2026-02-30" };
  assert.match(journalValidationError({ broken }), /Invalid study journal/);
  assert.deepEqual(normalizeJournal({ ...state.journal, broken }), state.journal);
  assert.deepEqual(normalizeJournal([]), {});
  assert.match(journalValidationError([]), /Expected a journal/);
  assert.throws(() => saveJournalEntry(state, { ...context, date: "2026-02-30" }, {}), /valid study date/);
  assert.throws(() => saveJournalEntry(state, context, { done: "yes" }), /Invalid journal done/);
  assert.throws(() => saveJournalEntry(state, { ...context, date: "2026-11-03", id: entry.id }, {}), /different subject or date/);
});

test("imports reject malformed diary records or settings before normalization can discard data", () => {
  const state = blank();
  const entry = saveJournalEntry(state, context, { work: "Original notes" }, firstSave);
  for (const journal of [
    [], null,
    { ...state.journal, broken: { id: "broken", work: "Do not discard these notes" } },
    { [entry.id]: { ...entry, revisions: [{ work: "Incomplete revision" }] } },
    { [entry.id]: { ...entry, end: null } },
  ]) {
    assert.throws(() => migrateExport({ ...state, journal }), /journal/);
  }
  for (const settings of [[], null, false, { sessionEndSound: "false" }])
    assert.throws(() => migrateExport({ ...state, settings }), /sound settings/);
  assert.equal(state.journal[entry.id].work, "Original notes");
  assert.deepEqual(normalizeState(migrateExport(state)), state);
});
