import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_POMODORO, createPomodoro, normalizePomodoro, pausePomodoro,
  pomodoroRemaining, pomodoroSettingsError, reconcilePomodoroPreferences,
  resetPomodoro, restorePomodoro, selectPomodoroMode, skipPomodoro,
  startPomodoro, tickPomodoro,
} from "../src/lib/pomodoro.js";

const quick = { ...DEFAULT_POMODORO, focusMinutes: 1, shortBreakMinutes: 1, longBreakMinutes: 2, longBreakEvery: 2 };

test("old workspaces receive useful preferences while invalid supplied values are rejected", () => {
  assert.deepEqual(normalizePomodoro(), DEFAULT_POMODORO);
  assert.equal(pomodoroSettingsError(undefined), null);
  assert.equal(pomodoroSettingsError(quick), null);
  for (const invalid of [{ focusMinutes: 0 }, { shortBreakMinutes: 1.5 }, { longBreakMinutes: 121 }, { longBreakEvery: 13 }, { soundEnabled: 1 }, { ambient: "missing" }, { ambientVolume: -1 }, null])
    assert.ok(pomodoroSettingsError(invalid));
  assert.equal(normalizePomodoro({ focusMinutes: 99, ambient: "rain", ambientVolume: 3 }).focusMinutes, 99);
  assert.equal(normalizePomodoro({ ambientVolume: 3 }).ambientVolume, 1);
});

test("pause and resume preserve real elapsed time without countdown drift", () => {
  const started = startPomodoro(createPomodoro(quick), 1000);
  assert.equal(pomodoroRemaining(started, 12550), 48450);
  assert.equal(pomodoroRemaining(started, -1000), 60000);
  const paused = pausePomodoro(started, 12550);
  assert.equal(pomodoroRemaining(paused, 90000), 48450);
  const resumed = startPomodoro(paused, 100000);
  assert.equal(resumed.deadline, 148450);
  assert.equal(pomodoroRemaining(resumed, 148450), 0);
  assert.equal(startPomodoro(resumed, 100100), resumed);
});

test("natural focus completions select short and long breaks at the configured cadence", () => {
  let state = startPomodoro(createPomodoro(quick), 0);
  let result = tickPomodoro(state, quick, 60000);
  assert.equal(result.completed.mode, "focus");
  assert.equal(result.state.completedFocus, 1);
  assert.equal(result.state.mode, "shortBreak");
  assert.equal(result.state.running, false);
  assert.equal(tickPomodoro(result.state, quick, 61000).completed, null);
  state = startPomodoro(result.state, 60000);
  result = tickPomodoro(state, quick, 120000);
  assert.equal(result.state.mode, "focus");
  assert.equal(result.state.completedFocus, 1);
  result = tickPomodoro(startPomodoro(result.state, 120000), quick, 180000);
  assert.equal(result.state.mode, "longBreak");
  assert.equal(result.state.totalMs, 120000);
  assert.equal(result.state.completedFocus, 2);
});

test("auto-start respects separate work/break choices and a long sleep advances only once", () => {
  const automatic = { ...quick, autoStartBreaks: true, autoStartFocus: false };
  const result = tickPomodoro(startPomodoro(createPomodoro(automatic), 0), automatic, 10_000_000);
  assert.equal(result.state.mode, "shortBreak");
  assert.equal(result.state.completedFocus, 1);
  assert.equal(result.state.running, true);
  assert.equal(result.state.deadline, 10_060_000);
  const end = tickPomodoro(result.state, automatic, 10_060_000);
  assert.equal(end.state.mode, "focus");
  assert.equal(end.state.running, false);
});

test("skip/reset/mode selection pause and never credit an unfinished focus interval", () => {
  const running = startPomodoro(createPomodoro(quick), 0);
  const skipped = skipPomodoro(running, quick);
  assert.equal(skipped.mode, "shortBreak");
  assert.equal(skipped.completedFocus, 0);
  assert.equal(skipped.running, false);
  assert.equal(skipPomodoro(skipped, quick).mode, "focus");
  assert.equal(resetPomodoro(pausePomodoro(running, 15000), quick).remainingMs, 60000);
  const selected = selectPomodoroMode(running, "longBreak", quick);
  assert.equal(selected.mode, "longBreak");
  assert.equal(selected.running, false);
  assert.equal(selected.completedFocus, 0);
});

test("duration edits preserve a running deadline and reset paused timers to the new duration", () => {
  const changed = { ...quick, focusMinutes: 3 };
  const running = startPomodoro(createPomodoro(quick), 1000);
  assert.equal(reconcilePomodoroPreferences(running, quick, changed), running);
  const paused = pausePomodoro(running, 2000);
  const adjusted = reconcilePomodoroPreferences(paused, quick, changed);
  assert.equal(adjusted.remainingMs, 180000);
  assert.equal(adjusted.running, false);
});

test("reload validates runtime, resumes exact deadlines and suppresses expired auto-starts", () => {
  const running = startPomodoro(createPomodoro(quick), 1000);
  assert.deepEqual(restorePomodoro(JSON.parse(JSON.stringify(running)), quick, 2000), running);
  const paused = pausePomodoro(running, 5000);
  assert.deepEqual(restorePomodoro(paused, quick, 9000), paused);
  const expired = restorePomodoro(running, { ...quick, autoStartBreaks: true }, 100000);
  assert.equal(expired.mode, "shortBreak");
  assert.equal(expired.completedFocus, 1);
  assert.equal(expired.running, false);
  for (const raw of [null, {}, { ...running, deadline: Infinity }, { ...running, completedFocus: -1 }, { ...running, remainingMs: -1 }, { ...running, version: 2 }, { ...running, deadline: 99999999 }])
    assert.deepEqual(restorePomodoro(raw, quick, 2000), createPomodoro(quick));
});

test("Pomodoro preferences survive portable state and invalid imports fail before replacement", async () => {
  const { normalizeState } = await import("../src/lib/planner.js");
  const { migrateExport } = await import("../src/lib/legacy.js");
  const { validateState } = await import("../server/storage.js");
  const state = normalizeState({ settings: { pomodoro: { ...quick, ambient: "rain", ambientVolume: 0.6 } } });
  const restored = normalizeState(migrateExport(JSON.parse(JSON.stringify(state))));
  assert.deepEqual(restored.settings.pomodoro, state.settings.pomodoro);
  assert.equal(validateState(restored), restored);
  for (const invalid of [{ focusMinutes: 0 }, { ambient: "missing" }, { ambientDuringBreaks: "yes" }, { ambientVolume: 3 }]) {
    const bad = structuredClone(state);
    Object.assign(bad.settings.pomodoro, invalid);
    assert.throws(() => migrateExport(bad), /Pomodoro/);
    assert.throws(() => validateState(bad), /Pomodoro/);
  }
});
