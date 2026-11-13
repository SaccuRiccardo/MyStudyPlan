import test from "node:test";
import assert from "node:assert/strict";
import { createAmbientPlayer, generateNoiseSamples } from "../src/lib/ambientAudio.js";

function randomSource() {
  let seed = 19;
  return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
}
const energy = (samples) => samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length;
const roughness = (samples) => {
  let sum = 0;
  for (let i = 1; i < samples.length; i += 1) sum += (samples[i] - samples[i - 1]) ** 2;
  return sum / samples.length / energy(samples);
};

test("all ambient signals are bounded and audible; brown has less high-frequency energy", () => {
  const signals = Object.fromEntries(["white", "brown", "pink", "rain"].map((kind) => [kind, generateNoiseSamples(kind, 44100, 44100, randomSource())]));
  for (const signal of Object.values(signals)) {
    assert.equal(signal.length, 44100);
    assert.ok(signal.every((sample) => Number.isFinite(sample) && Math.abs(sample) <= 0.95));
    assert.ok(energy(signal) > 0.001);
  }
  assert.ok(roughness(signals.brown) < roughness(signals.white) / 10);
  assert.ok(roughness(signals.pink) < roughness(signals.white));
  assert.notDeepEqual(signals.rain, signals.white);
  assert.equal(signals.brown.at(-1), signals.brown[0]);
  assert.equal(signals.pink.at(-1), signals.pink[0]);
  assert.throws(() => generateNoiseSamples("unknown", 10), /Choose/);
});

function audioMock({ suspended = false, resume } = {}) {
  const instances = [];
  class Context {
    constructor() { instances.push(this); }
    state = suspended ? "suspended" : "running";
    sampleRate = 100;
    currentTime = 1;
    destination = {};
    sources = [];
    gains = [];
    filters = [];
    async resume() { if (resume) await resume(); this.state = "running"; }
    async close() { this.state = "closed"; }
    createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) }; }
    createBufferSource() {
      const node = { starts: 0, stops: 0, disconnects: 0, connect() {}, start() { this.starts++; }, stop() { this.stops++; this.onended?.(); }, disconnect() { this.disconnects++; } };
      this.sources.push(node); return node;
    }
    createGain() {
      const node = { gain: { value: 0, ramps: [], cancelScheduledValues() {}, setValueAtTime(value) { this.value = value; }, linearRampToValueAtTime(value) { this.ramps.push(value); this.value = value; } }, connect() {}, disconnect() {} };
      this.gains.push(node); return node;
    }
    createBiquadFilter() {
      const node = { frequency: {}, Q: {}, connect() {}, disconnect() {} };
      this.filters.push(node); return node;
    }
  }
  return { Context, instances };
}

test("player changes sounds without duplicate sources, fades volume, and releases resources", async () => {
  const oldWindow = globalThis.window;
  const mock = audioMock();
  globalThis.window = { AudioContext: mock.Context };
  try {
    const player = createAmbientPlayer();
    await player.play("brown", 0.4);
    const context = mock.instances[0];
    assert.equal(context.sources[0].loop, true);
    await player.play("brown", 2);
    assert.equal(context.sources.length, 1);
    assert.equal(context.gains[0].gain.ramps.at(-1), 1);
    player.setVolume(-1);
    assert.equal(context.gains[0].gain.ramps.at(-1), 0);
    await player.play("rain", 0.3);
    assert.equal(context.filters.length, 2);
    assert.equal(context.sources[0].stops, 1);
    player.stop();
    assert.equal(context.sources[1].stops, 1);
    assert.equal(context.sources[1].disconnects, 1);
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.equal(context.state, "closed");
    player.dispose();
    await assert.rejects(player.play("white"), /closed/);
  } finally { globalThis.window = oldWindow; }
});

test("stopping during asynchronous unlock cannot resurrect ambient playback", async () => {
  const oldWindow = globalThis.window;
  let unblock;
  const mock = audioMock({ suspended: true, resume: () => new Promise((resolve) => { unblock = resolve; }) });
  globalThis.window = { AudioContext: mock.Context };
  try {
    const player = createAmbientPlayer();
    const pending = player.play("white", 0.5);
    assert.equal(typeof unblock, "function", "resume is requested immediately in the caller gesture");
    player.stop();
    unblock();
    await pending;
    assert.equal(mock.instances[0].sources.length, 0);
    player.dispose();
  } finally { globalThis.window = oldWindow; }
});

test("unsupported browsers and rejected unlocks return actionable playback errors", async () => {
  const oldWindow = globalThis.window;
  try {
    globalThis.window = {};
    await assert.rejects(createAmbientPlayer().play("white"), /does not support/);
    const mock = audioMock({ suspended: true, resume: () => Promise.reject(new Error("Browser denied audio")) });
    globalThis.window = { AudioContext: mock.Context };
    await assert.rejects(createAmbientPlayer().play("white"), /Browser denied audio/);
  } finally { globalThis.window = oldWindow; }
});
