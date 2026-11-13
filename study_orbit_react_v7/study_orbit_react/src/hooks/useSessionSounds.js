import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  createSessionSoundTracker,
  getSessionAudioStatus,
  playSessionSound,
  subscribeSessionAudioStatus,
  unlockSessionAudio,
} from "../lib/sessionSounds.js";

/** Keep alerts active across workspace pages, with no stale sounds on first load. */
export function useSessionSounds({ phase, now, settings = {} }) {
  const tracker = useRef(null);
  if (!tracker.current) tracker.current = createSessionSoundTracker();
  const enabled = !!(settings.sessionStartSound || settings.sessionEndSound);
  const audio = useSyncExternalStore(subscribeSessionAudioStatus, getSessionAudioStatus);

  useEffect(() => {
    if (!enabled) return;
    const unlock = () => { unlockSessionAudio().catch(() => {}); };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, [enabled]);

  useEffect(() => {
    const events = tracker.current.tick(phase, now, settings);
    for (const event of events) playSessionSound(event.kind).catch(() => {});
  }, [phase, now, settings.sessionStartSound, settings.sessionEndSound]);

  return { soundError: enabled && audio.state === "blocked" ? audio.message : "" };
}
