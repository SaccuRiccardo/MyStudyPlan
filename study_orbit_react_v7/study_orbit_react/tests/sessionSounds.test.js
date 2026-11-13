import test from "node:test";
import assert from "node:assert/strict";
import { createSessionSoundTracker, sessionSoundEvents } from "../src/lib/sessionSounds.js";

const settings = { sessionStartSound: true, sessionEndSound: true };
const phase = { id: "semester", slots: [
  { id: "first", day: 0, start: 540, end: 600 },
  { id: "second", day: 0, start: 600, end: 660 },
] };
const monday = (hours, minutes = 0, seconds = 0) => new Date(2026, 10, 9, hours, minutes, seconds);

test("independent sound switches ring only on crossed boundaries", () => {
  assert.deepEqual(sessionSoundEvents(phase, monday(8, 59, 59), monday(9), settings).map((event) => event.kind), ["start"]);
  assert.deepEqual(sessionSoundEvents(phase, monday(9, 59, 59), monday(10), settings).map((event) => event.kind), ["end"]);
  assert.deepEqual(sessionSoundEvents(phase, monday(9, 59, 59), monday(10), { sessionStartSound: true }), []);
  assert.deepEqual(sessionSoundEvents(phase, monday(8, 59, 59), monday(9), { sessionEndSound: true }), []);
  assert.deepEqual(sessionSoundEvents(phase, monday(8, 59, 59), monday(9), {}), []);
});

test("start sound follows actual start after the previous ten-minute handoff", () => {
  assert.deepEqual(sessionSoundEvents(phase, monday(9, 59, 59), monday(10), { sessionStartSound: true }), []);
  const events = sessionSoundEvents(phase, monday(10, 9, 59), monday(10, 10), settings);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "start");
  assert.match(events[0].key, /second:start/);
});

test("overnight and Sunday continuation alerts use their originating study day", () => {
  const overnight = { id: "overnight", slots: [
    { id: "late", day: 6, start: 1380, end: 1500 },
    { id: "following", day: 6, start: 1500, end: 1560 },
  ] };
  const end = sessionSoundEvents(overnight, monday(0, 59, 59), monday(1), settings);
  assert.equal(end[0].kind, "end");
  assert.match(end[0].key, /2026-11-08:late:end/);
  const start = sessionSoundEvents(overnight, monday(1, 9, 59), monday(1, 10), settings);
  assert.equal(start[0].kind, "start");
  assert.match(start[0].key, /2026-11-08:following:start/);
});

test("a background minute can deliver a recent sound while a long sleep never replays stale alerts", () => {
  assert.equal(sessionSoundEvents(phase, monday(8, 59, 30), monday(9, 0, 30), settings).length, 1);
  assert.deepEqual(sessionSoundEvents(phase, monday(8, 58), monday(9, 2), settings), []);
  assert.deepEqual(sessionSoundEvents(phase, null, monday(9), settings), []);
  assert.deepEqual(sessionSoundEvents(phase, monday(9, 1), monday(9), settings), []);
});

test("tracker does not replay on initial load, settings changes, schedule edits, or backwards clocks", () => {
  const tracker = createSessionSoundTracker();
  assert.deepEqual(tracker.tick(phase, monday(8, 59, 59), settings), []);
  assert.equal(tracker.tick(phase, monday(9), settings).length, 1);
  assert.deepEqual(tracker.tick(phase, monday(9), settings), []);
  assert.deepEqual(tracker.tick(phase, monday(8, 59, 59), settings), []);
  assert.deepEqual(tracker.tick(phase, monday(9), settings), []);
  assert.deepEqual(tracker.tick(phase, monday(9, 59, 59), {}), []);
  assert.deepEqual(tracker.tick(phase, monday(10), settings), []);
  const edited = { ...phase, slots: [{ ...phase.slots[0], start: 601, end: 660 }] };
  assert.deepEqual(tracker.tick(edited, monday(10, 1), settings), []);
});

test("fully consumed short sessions do not produce phantom start or end sounds", () => {
  const short = { ...phase, slots: [...phase.slots, { id: "consumed", day: 0, start: 660, end: 665 }] };
  assert.deepEqual(sessionSoundEvents(short, monday(11, 4, 59), monday(11, 5), settings), []);
});

test("audio unlock reports failures and test sounds use distinct rising/falling notes", async () => {
  const { unlockSessionAudio, playSessionSound, getSessionAudioStatus } = await import("../src/lib/sessionSounds.js");
  const previousWindow = globalThis.window;
  let allowed = false;
  const frequencies = [];
  globalThis.window = { AudioContext: class {
    get state() { return allowed ? "running" : "suspended"; }
    currentTime = 0;
    destination = {};
    async resume() { if (!allowed) throw new Error("Browser audio blocked"); }
    createOscillator() {
      return { frequency: { set value(value) { frequencies.push(value); } }, connect() {}, start() {}, stop() {}, disconnect() {} };
    }
    createGain() {
      return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} };
    }
  } };
  try {
    await assert.rejects(unlockSessionAudio(), /Browser audio blocked/);
    assert.equal(getSessionAudioStatus().state, "blocked");
    await assert.rejects(playSessionSound(), /Click Test sound/);
    allowed = true;
    await unlockSessionAudio();
    await playSessionSound("start");
    await playSessionSound("end");
    assert.deepEqual(frequencies, [523.25, 659.25, 659.25, 523.25]);
    assert.equal(getSessionAudioStatus().state, "ready");
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
