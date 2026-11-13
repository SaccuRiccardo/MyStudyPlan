export const DEFAULT_POMODORO = Object.freeze({
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  autoStartBreaks: false,
  autoStartFocus: false,
  soundEnabled: true,
  ambient: "brown",
  ambientVolume: 0.35,
  ambientDuringBreaks: false,
});
export const POMODORO_MODES = ["focus", "shortBreak", "longBreak"];
export const AMBIENT_SOUNDS = ["off", "white", "brown", "rain", "pink"];
const limits = { focusMinutes: 180, shortBreakMinutes: 60, longBreakMinutes: 120, longBreakEvery: 12 };
const booleanFields = ["autoStartBreaks", "autoStartFocus", "soundEnabled", "ambientDuringBreaks"];
const object = (value) => value && typeof value === "object" && !Array.isArray(value);

/** Older workspaces may omit any timer preference; present fields must be valid. */
export function pomodoroSettingsError(preferences) {
  if (preferences === undefined) return null;
  if (!object(preferences)) return "Expected Pomodoro preferences.";
  for (const [field, maximum] of Object.entries(limits))
    if (preferences[field] !== undefined && (!Number.isInteger(preferences[field]) || preferences[field] < 1 || preferences[field] > maximum))
      return `Invalid Pomodoro ${field}; choose a whole number from 1 to ${maximum}.`;
  for (const field of booleanFields)
    if (preferences[field] !== undefined && typeof preferences[field] !== "boolean") return `Invalid Pomodoro ${field}.`;
  if (preferences.ambient !== undefined && !AMBIENT_SOUNDS.includes(preferences.ambient)) return "Invalid Pomodoro background sound.";
  if (preferences.ambientVolume !== undefined && (!Number.isFinite(preferences.ambientVolume) || preferences.ambientVolume < 0 || preferences.ambientVolume > 1)) return "Invalid Pomodoro background volume.";
  return null;
}

export function normalizePomodoro(raw) {
  const input = object(raw) ? raw : {};
  const preferences = { ...DEFAULT_POMODORO };
  for (const [field, maximum] of Object.entries(limits))
    if (Number.isInteger(input[field]) && input[field] >= 1 && input[field] <= maximum) preferences[field] = input[field];
  for (const field of booleanFields)
    if (typeof input[field] === "boolean") preferences[field] = input[field];
  if (AMBIENT_SOUNDS.includes(input.ambient)) preferences.ambient = input.ambient;
  if (Number.isFinite(input.ambientVolume)) preferences.ambientVolume = Math.min(1, Math.max(0, input.ambientVolume));
  return preferences;
}

export function pomodoroDuration(mode, preferences = DEFAULT_POMODORO) {
  const settings = normalizePomodoro(preferences);
  const field = mode === "shortBreak" ? "shortBreakMinutes" : mode === "longBreak" ? "longBreakMinutes" : "focusMinutes";
  return settings[field] * 60_000;
}

export function createPomodoro(preferences = DEFAULT_POMODORO, mode = "focus", completedFocus = 0) {
  const selected = POMODORO_MODES.includes(mode) ? mode : "focus";
  const totalMs = pomodoroDuration(selected, preferences);
  return { version: 1, mode: selected, running: false, remainingMs: totalMs, totalMs, deadline: null, completedFocus };
}

export function pomodoroRemaining(state, at = Date.now()) {
  return Math.max(0, Math.min(state.totalMs, state.running ? state.deadline - at : state.remainingMs));
}

export function startPomodoro(state, at = Date.now()) {
  if (state.running) return state;
  const remainingMs = state.remainingMs > 0 ? state.remainingMs : state.totalMs;
  return { ...state, running: true, remainingMs, deadline: at + remainingMs };
}

export function pausePomodoro(state, at = Date.now()) {
  if (!state.running) return state;
  return { ...state, running: false, remainingMs: pomodoroRemaining(state, at), deadline: null };
}

/** Advance once from an expired interval, never manufacture rounds after device sleep. */
export function tickPomodoro(state, preferences = DEFAULT_POMODORO, at = Date.now()) {
  if (!state.running || state.deadline > at) return { state, completed: null };
  const settings = normalizePomodoro(preferences);
  const completedFocus = state.completedFocus + (state.mode === "focus" ? 1 : 0);
  const mode = state.mode === "focus"
    ? completedFocus % settings.longBreakEvery === 0 ? "longBreak" : "shortBreak"
    : "focus";
  let next = createPomodoro(settings, mode, completedFocus);
  const autoStart = state.mode === "focus" ? settings.autoStartBreaks : settings.autoStartFocus;
  if (autoStart) next = startPomodoro(next, at);
  return { state: next, completed: { mode: state.mode, completedFocus, completedAt: state.deadline } };
}

/** Skipping an unfinished focus interval does not count it toward a long break. */
export function skipPomodoro(state, preferences = DEFAULT_POMODORO) {
  return createPomodoro(preferences, state.mode === "focus" ? "shortBreak" : "focus", state.completedFocus);
}

export function resetPomodoro(state, preferences = DEFAULT_POMODORO) {
  return createPomodoro(preferences, state.mode, state.completedFocus);
}

export function selectPomodoroMode(state, mode, preferences = DEFAULT_POMODORO) {
  return createPomodoro(preferences, mode, state.completedFocus);
}

/** A duration edit applies to a paused timer; running deadlines remain unchanged. */
export function reconcilePomodoroPreferences(state, before, after) {
  if (state.running || pomodoroDuration(state.mode, before) === pomodoroDuration(state.mode, after)) return state;
  return resetPomodoro(state, after);
}

/** Validate same-tab runtime separately from durable study records and preferences. */
export function restorePomodoro(raw, preferences = DEFAULT_POMODORO, at = Date.now()) {
  if (!object(raw) || raw.version !== 1 || !POMODORO_MODES.includes(raw.mode) || typeof raw.running !== "boolean" ||
      !Number.isFinite(raw.totalMs) || raw.totalMs < 60_000 || raw.totalMs > 180 * 60_000 ||
      !Number.isFinite(raw.remainingMs) || raw.remainingMs < 0 || raw.remainingMs > raw.totalMs ||
      !Number.isSafeInteger(raw.completedFocus) || raw.completedFocus < 0 ||
      (raw.running && (!Number.isFinite(raw.deadline) || raw.deadline > at + raw.totalMs))) return createPomodoro(preferences);
  const state = {
    version: 1, mode: raw.mode, running: raw.running,
    totalMs: raw.totalMs, remainingMs: raw.remainingMs,
    deadline: raw.running ? raw.deadline : null, completedFocus: raw.completedFocus,
  };
  // Never auto-start an overdue following interval during reload.
  const settings = { ...normalizePomodoro(preferences), autoStartBreaks: false, autoStartFocus: false };
  return tickPomodoro(state, settings, at).state;
}
