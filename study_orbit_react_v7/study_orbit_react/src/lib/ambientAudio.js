const KINDS = new Set(["white", "brown", "pink", "rain"]);
const FADE_SECONDS = 0.12;
const clampVolume = (value) => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0.35));

/** Generate local, bounded noise; the optional random function makes signal checks repeatable. */
export function generateNoiseSamples(kind, length, sampleRate = 44100, random = Math.random) {
  if (!KINDS.has(kind)) throw new Error("Choose white, brown, pink, or rain sound.");
  if (!Number.isInteger(length) || length < 1 || !Number.isFinite(sampleRate) || sampleRate <= 0)
    throw new Error("Invalid ambient sound buffer.");
  const samples = new Float32Array(length);
  let brown = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i += 1) {
    const white = random() * 2 - 1;
    if (kind === "white") samples[i] = white * 0.45;
    else if (kind === "brown") {
      brown = (brown + 0.02 * white) / 1.02;
      samples[i] = brown * 3.5;
    } else {
      // A standard seven-pole pink-noise filter, kept quiet enough for a long study session.
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.09;
      b6 = white * 0.115926;
      if (kind === "pink") samples[i] = pink;
      else {
        const t = i / sampleRate;
        // Softly varying broadband rainfall, synthesized entirely in the browser.
        const swell = 0.74 + 0.12 * Math.sin(t * Math.PI / 2) + 0.08 * Math.sin(t * Math.PI * 1.25);
        samples[i] = (pink * 0.6 + white * 0.3) * swell;
      }
    }
    samples[i] = Math.max(-0.95, Math.min(0.95, samples[i]));
  }
  // Make the loop seam gentle, particularly for slowly changing brown noise.
  const seam = kind === "brown" || kind === "pink"
    ? Math.min(Math.floor(sampleRate * 0.04), Math.floor(length / 4))
    : 0;
  for (let i = 0; i < seam; i += 1) {
    const mix = (i + 1) / seam;
    const index = length - seam + i;
    samples[index] = samples[index] * (1 - mix) + samples[0] * mix;
  }
  return samples;
}

/** A gesture-started ambient player with no requests to external audio services. */
export function createAmbientPlayer() {
  let context = null;
  let active = null;
  let generation = 0;
  let disposed = false;
  let volume = 0.35;
  const buffers = new Map();

  function releaseVoice(voice, fade = true) {
    if (!voice) return;
    const at = voice.context.currentTime;
    voice.gain.gain.cancelScheduledValues(at);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, at);
    voice.gain.gain.linearRampToValueAtTime(0, at + (fade ? FADE_SECONDS : 0));
    const disconnect = () => {
      voice.source.disconnect();
      voice.gain.disconnect();
      for (const filter of voice.filters) filter.disconnect();
    };
    voice.source.onended = disconnect;
    try { voice.source.stop(at + (fade ? FADE_SECONDS : 0)); }
    catch { disconnect(); }
  }

  function retireContext(oldContext, delay) {
    if (!oldContext) return;
    const close = () => { Promise.resolve(oldContext.close()).catch(() => {}); };
    if (delay) setTimeout(close, Math.ceil(FADE_SECONDS * 1000) + 30);
    else close();
  }

  return {
    async play(kind, requestedVolume = volume) {
      if (disposed) throw new Error("This ambient player has been closed.");
      if (!KINDS.has(kind)) throw new Error("Choose white, brown, pink, or rain sound.");
      const request = ++generation;
      volume = clampVolume(requestedVolume);
      let targetContext;
      try {
        // Construct and resume synchronously in the caller's click/key gesture.
        const AudioContextClass = globalThis.window?.AudioContext || globalThis.window?.webkitAudioContext;
        if (!AudioContextClass) throw new Error("This browser does not support ambient audio.");
        if (!context || context.state === "closed") {
          context = new AudioContextClass();
          buffers.clear();
        }
        targetContext = context;
        if (targetContext.state !== "running") {
          let timer;
          try {
            await Promise.race([
              targetContext.resume(),
              new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Audio is paused. Click Start again to enable it.")), 2500); }),
            ]);
          } finally { clearTimeout(timer); }
        }
        if (request !== generation || disposed || context !== targetContext) return;
        if (targetContext.state !== "running") throw new Error("Audio is paused. Click Start again to enable it.");
        if (active?.kind === kind) {
          this.setVolume(volume);
          return;
        }
        if (!buffers.has(kind)) {
          const length = Math.round(targetContext.sampleRate * 8);
          const buffer = targetContext.createBuffer(1, length, targetContext.sampleRate);
          buffer.getChannelData(0).set(generateNoiseSamples(kind, length, targetContext.sampleRate));
          buffers.set(kind, buffer);
        }
        const source = targetContext.createBufferSource();
        const gain = targetContext.createGain();
        const filters = [];
        source.buffer = buffers.get(kind);
        source.loop = true;
        let tail = source;
        if (kind === "rain") {
          for (const [type, frequency] of [["highpass", 220], ["lowpass", 6500]]) {
            const filter = targetContext.createBiquadFilter();
            filter.type = type;
            filter.frequency.value = frequency;
            filter.Q.value = 0.5;
            tail.connect(filter);
            tail = filter;
            filters.push(filter);
          }
        }
        tail.connect(gain);
        gain.connect(targetContext.destination);
        const at = targetContext.currentTime;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(volume, at + FADE_SECONDS);
        source.start();
        releaseVoice(active);
        active = { kind, source, gain, filters, context: targetContext };
      } catch (error) {
        if (request !== generation || disposed) return;
        this.stop();
        throw new Error(error?.message || "Ambient sound could not play. Try Start again.");
      }
    },
    setVolume(value) {
      volume = clampVolume(value);
      if (!active) return;
      const at = active.context.currentTime;
      active.gain.gain.cancelScheduledValues(at);
      active.gain.gain.setValueAtTime(active.gain.gain.value, at);
      active.gain.gain.linearRampToValueAtTime(volume, at + FADE_SECONDS);
    },
    stop() {
      generation += 1;
      const oldContext = context;
      const hadVoice = !!active;
      releaseVoice(active);
      active = null;
      context = null;
      buffers.clear();
      retireContext(oldContext, hadVoice);
    },
    dispose() {
      disposed = true;
      this.stop();
    },
  };
}
