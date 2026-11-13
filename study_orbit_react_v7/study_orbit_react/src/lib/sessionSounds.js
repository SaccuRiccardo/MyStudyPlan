import { dateKey, getSchedulePosition } from "./time.js";

// A background tab can refresh only once per minute. Do not replay old alerts
// after a longer device sleep or when the user returns to a closed session.
export const SOUND_GRACE_MS = 90_000;

/** Return only usable session boundaries crossed since the last clock tick. */
export function sessionSoundEvents(phase, previousAt, now, settings = {}) {
  const current = Number(now);
  const previous = previousAt == null ? NaN : Number(previousAt);
  if (
    !phase || !Number.isFinite(current) || !Number.isFinite(previous) ||
    current <= previous || current - previous > SOUND_GRACE_MS
  ) return [];

  return getSchedulePosition(phase, new Date(current)).events
    .filter((event) => event.actualStart < event.end)
    .flatMap((event) => [
      { kind: "start", at: event.actualStart.getTime(), enabled: settings.sessionStartSound },
      { kind: "end", at: event.end.getTime(), enabled: settings.sessionEndSound },
    ].filter((boundary) => boundary.enabled && boundary.at > previous && boundary.at <= current)
      .map(({ kind, at }) => ({
        kind,
        at,
        key: `${phase.id}:${dateKey(event.base)}:${event.slot.id}:${kind}:${at}`,
      })))
    .sort((a, b) => a.at - b.at);
}

/** Track transitions without replaying when settings, schedules, or clocks change. */
export function createSessionSoundTracker() {
  let previousAt = null;
  let previousConfig = null;
  const heard = new Set();
  return {
    tick(phase, now, settings = {}) {
      const config = JSON.stringify([
        phase?.id,
        phase?.slots.map(({ id, day, start, end }) => [id, day, start, end]),
        !!settings.sessionStartSound,
        !!settings.sessionEndSound,
      ]);
      const events = config === previousConfig
        ? sessionSoundEvents(phase, previousAt, now, settings)
        : [];
      previousAt = Number(now);
      previousConfig = config;
      const fresh = events.filter(({ key }) => !heard.has(key));
      for (const { key } of fresh) heard.add(key);
      // Keep recent boundaries to prevent repeats after a small backwards clock change.
      while (heard.size > 200) heard.delete(heard.values().next().value);
      return fresh;
    },
  };
}

let audioContext = null;
let audioStatus = { state: "idle", message: "Use Test sound to enable audio in this browser." };
const listeners = new Set();
const updateStatus = (state, message) => {
  if (audioStatus.state === state && audioStatus.message === message) return;
  audioStatus = { state, message };
  for (const listener of listeners) listener();
};
export const getSessionAudioStatus = () => audioStatus;
export const subscribeSessionAudioStatus = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function playbackError(error) {
  const message = error?.message || "Audio could not play. Try Test sound again.";
  updateStatus("blocked", message);
  return new Error(message);
}

/** Call directly from a click/key gesture so browser autoplay rules permit alerts. */
export async function unlockSessionAudio() {
  try {
    const AudioContextClass = globalThis.window?.AudioContext || globalThis.window?.webkitAudioContext;
    if (!AudioContextClass) throw new Error("This browser does not support session sounds.");
    if (!audioContext || audioContext.state === "closed") audioContext = new AudioContextClass();
    if (audioContext.state !== "running") {
      let timer;
      try {
        await Promise.race([
          audioContext.resume(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("Audio is paused. Click Test sound to enable it.")), 2500);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    if (audioContext.state !== "running") throw new Error("Audio is paused. Click Test sound to enable it.");
    updateStatus("ready", "Session audio is enabled in this browser.");
  } catch (error) {
    throw playbackError(error);
  }
}

/** Play a stronger repeated alert or the locally saved custom sound. */
export async function playSessionSound(kind = "start", settings = {}) {
  try {
    if (!audioContext || audioContext.state !== "running")
      throw new Error("Audio is paused. Click Test sound in Settings to enable it.");
    const volume = Math.max(0, Math.min(1, settings.soundVolume ?? 0.8));
    if (settings.customSound) {
      const response = await fetch(settings.customSound.data);
      const buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
      const source = audioContext.createBufferSource();
      const gain = audioContext.createGain();
      source.buffer = buffer;
      gain.gain.value = volume;
      source.connect(gain);
      gain.connect(audioContext.destination);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      source.start();
      source.stop(audioContext.currentTime + Math.min(buffer.duration, 15));
      updateStatus("ready", "Custom session sound played.");
      return;
    }
    const notes = kind === "end" ? [880, 659.25, 880, 659.25] : [659.25, 880, 659.25, 880];
    const start = audioContext.currentTime + 0.01;
    notes.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const at = start + index * 0.32;
      oscillator.type = "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.55 * volume, at + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.32);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(at);
      oscillator.stop(at + 0.34);
    });
    updateStatus("ready", "Session audio is enabled in this browser.");
  } catch (error) {
    throw playbackError(error);
  }
}


export const MAX_SOUND_BYTES = 1024 * 1024;
export function soundSettingsError(settings) {
  if (settings.soundVolume !== undefined && (!Number.isFinite(settings.soundVolume) || settings.soundVolume < 0 || settings.soundVolume > 1)) return "Invalid sound volume.";
  if (settings.customSound != null && (typeof settings.customSound !== "object" || typeof settings.customSound.name !== "string" || settings.customSound.name.length > 255 || typeof settings.customSound.data !== "string" || !/^data:audio\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/.test(settings.customSound.data) || settings.customSound.data.length > Math.ceil(MAX_SOUND_BYTES / 3) * 4 + 100)) return "Invalid custom sound (maximum 1 MB).";
  return null;
}

export async function readSoundFile(file) {
  if (!file || !file.type.startsWith("audio/")) throw new Error("Choose an audio file such as MP3, WAV or OGG.");
  if (!file.size || file.size > MAX_SOUND_BYTES) throw new Error("Choose an audio file up to 1 MB.");
  await unlockSessionAudio();
  const bytes = await file.arrayBuffer();
  await audioContext.decodeAudioData(bytes.slice(0));
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read this sound."));
    reader.readAsDataURL(file);
  });
  return { name: file.name.slice(0, 255), data };
}
