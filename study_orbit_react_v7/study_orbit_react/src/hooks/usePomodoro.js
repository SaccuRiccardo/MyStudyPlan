import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPomodoro,
  normalizePomodoro,
  pausePomodoro,
  pomodoroRemaining,
  reconcilePomodoroPreferences,
  resetPomodoro,
  restorePomodoro,
  selectPomodoroMode,
  skipPomodoro,
  startPomodoro,
  tickPomodoro,
} from "../lib/pomodoro.js";

export const POMODORO_STORAGE_KEY = "study-orbit:pomodoro:v1";

function readRuntime(preferences) {
  try {
    const raw = window.sessionStorage.getItem(POMODORO_STORAGE_KEY);
    return raw ? restorePomodoro(JSON.parse(raw), preferences) : createPomodoro(preferences);
  } catch { return createPomodoro(preferences); }
}

/** Keep one timer alive across workspace views; callbacks follow actual deadline transitions. */
export function usePomodoro({ preferences, onIntervalEnd, ready = true } = {}) {
  const settings = useMemo(() => normalizePomodoro(preferences), [preferences]);
  const [state, setState] = useState(() => ready ? readRuntime(settings) : createPomodoro(settings));
  const initialized = useRef(ready);
  const stateRef = useRef(state);
  const settingsRef = useRef(settings);
  const callbackRef = useRef(onIntervalEnd);
  const [now, setNow] = useState(Date.now);
  // Restoring a running timer must never authorize browser audio by itself.
  const [audioArmed, setAudioArmed] = useState(false);
  callbackRef.current = onIntervalEnd;

  const publish = useCallback((next) => {
    if (stateRef.current === next) return;
    stateRef.current = next;
    setState(next);
    try { window.sessionStorage.setItem(POMODORO_STORAGE_KEY, JSON.stringify(next)); } catch { /* Timer remains usable when browser storage is disabled. */ }
  }, []);

  const advance = useCallback((at) => {
    const result = tickPomodoro(stateRef.current, settingsRef.current, at);
    publish(result.state);
    if (result.completed) callbackRef.current?.(result.completed);
    return result.state;
  }, [publish]);

  useEffect(() => {
    if (!ready) return;
    if (!initialized.current) {
      initialized.current = true;
      settingsRef.current = settings;
      publish(readRuntime(settings));
      setNow(Date.now());
      return;
    }
    const next = reconcilePomodoroPreferences(stateRef.current, settingsRef.current, settings);
    settingsRef.current = settings;
    publish(next);
  }, [settings, ready, publish]);

  useEffect(() => {
    if (!ready) return;
    const refresh = () => {
      const at = Date.now();
      setNow(at);
      advance(at);
    };
    try { window.sessionStorage.setItem(POMODORO_STORAGE_KEY, JSON.stringify(stateRef.current)); } catch { /* Storage may be disabled. */ }
    refresh();
    const interval = setInterval(refresh, 250);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [advance, ready]);

  const action = useCallback((update) => {
    if (!ready || !initialized.current) return;
    const at = Date.now();
    setNow(at);
    publish(update(advance(at), at));
  }, [advance, publish, ready]);

  const start = useCallback(() => {
    setAudioArmed(true);
    action((current, at) => startPomodoro(current, at));
  }, [action]);
  const pause = useCallback(() => action((current, at) => pausePomodoro(current, at)), [action]);
  const reset = useCallback(() => action((current) => resetPomodoro(current, settingsRef.current)), [action]);
  const skip = useCallback(() => action((current) => skipPomodoro(current, settingsRef.current)), [action]);
  const selectMode = useCallback((mode) => action((current) => selectPomodoroMode(current, mode, settingsRef.current)), [action]);

  return {
    mode: state.mode,
    running: state.running,
    remainingSeconds: Math.ceil(pomodoroRemaining(state, now) / 1000),
    totalSeconds: state.totalMs / 1000,
    completedFocus: state.completedFocus,
    audioArmed,
    start, pause, reset, skip, selectMode,
  };
}
