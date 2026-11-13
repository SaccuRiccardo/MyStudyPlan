import { useEffect, useRef, useState } from "react";
import { createAmbientPlayer } from "../lib/ambientAudio.js";

/** Keep ambience alive across workspace pages, without autoplaying after a reload. */
export function usePomodoroAudio({ running, mode, preferences }) {
  const player = useRef(null);
  if (!player.current) player.current = createAmbientPlayer();
  const [armed, setArmed] = useState(false);
  const [muted, setMuted] = useState(false);
  const [preview, setPreview] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const kind = preferences.ambient;
  const shouldPlay = armed && !muted && kind !== "off" &&
    (preview || (running && (mode === "focus" || preferences.ambientDuringBreaks)));

  useEffect(() => {
    const instance = createAmbientPlayer();
    player.current = instance;
    return () => instance.dispose();
  }, []);
  useEffect(() => { setPreview(false); }, [running, mode]);

  useEffect(() => {
    let active = true;
    if (shouldPlay) {
      player.current.play(kind, preferences.ambientVolume).then(() => {
        if (active) { setPlaying(true); setError(""); }
      }).catch((failure) => { if (active) { setPlaying(false); setError(failure.message); } });
    } else { player.current.stop(); setPlaying(false); }
    return () => { active = false; };
  }, [shouldPlay, kind]);
  useEffect(() => { player.current.setVolume(preferences.ambientVolume); }, [preferences.ambientVolume]);

  const arm = () => {
    setArmed(true); setMuted(false); setPreview(false); setError("");
    // Resume inside the user gesture, before React's follow-up effect.
    if (kind !== "off" && (mode === "focus" || preferences.ambientDuringBreaks)) player.current.play(kind, preferences.ambientVolume)
      .catch((failure) => setError(failure.message));
  };
  const toggle = () => {
    if (playing) {
      setMuted(true); setPreview(false); player.current.stop(); setPlaying(false);
    } else {
      setArmed(true); setMuted(false); setPreview(true); setError("");
      if (kind !== "off") player.current.play(kind, preferences.ambientVolume)
        .catch((failure) => setError(failure.message));
    }
  };
  const stopPreview = () => { setPreview(false); };
  return { playing, error, arm, toggle, stopPreview };
}
