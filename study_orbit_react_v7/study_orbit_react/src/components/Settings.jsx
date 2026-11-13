import { useState, useSyncExternalStore } from "react";
import { BellRing, Volume2 } from "lucide-react";
import {
  getSessionAudioStatus,
  playSessionSound,
  subscribeSessionAudioStatus,
  unlockSessionAudio,
} from "../lib/sessionSounds.js";

/** Persist independent session alerts and let the user unlock/test browser audio. */
export default function Settings({ settings, onChange }) {
  const audio = useSyncExternalStore(subscribeSessionAudioStatus, getSessionAudioStatus);
  const [testing, setTesting] = useState("");
  const [feedback, setFeedback] = useState("");

  const toggle = (field, checked) => {
    onChange({ ...settings, [field]: checked });
    setFeedback("");
    if (checked) unlockSessionAudio().catch(() => {});
  };
  const test = async (kind) => {
    setTesting(kind);
    setFeedback("");
    try {
      await unlockSessionAudio();
      await playSessionSound(kind);
      setFeedback(`${kind === "start" ? "Start" : "End"} sound played. Check your device volume if you could not hear it.`);
    } catch (error) {
      setFeedback(error.message);
    } finally {
      setTesting("");
    }
  };
  return (
    <section className="panel section-panel settings-panel" aria-labelledby="settingsTitle">
      <div className="section-top">
        <div>
          <span className="panel-overline">MAKE IT YOURS</span>
          <h2 id="settingsTitle"><BellRing size={19} /> Session sounds</h2>
        </div>
      </div>
      <p className="card-desc">Hear a gentle chime when a session starts or ends, even while you use another tab.</p>
      <div className="sound-settings">
        <label className="sound-setting">
          <input type="checkbox" checked={!!settings.sessionStartSound}
            onChange={(event) => toggle("sessionStartSound", event.target.checked)} />
          <span><strong>Sound at the beginning</strong><small>Play a rising chime when focus time begins, after any planning handoff.</small></span>
        </label>
        <label className="sound-setting">
          <input type="checkbox" checked={!!settings.sessionEndSound}
            onChange={(event) => toggle("sessionEndSound", event.target.checked)} />
          <span><strong>Sound at the end</strong><small>Play a falling chime when study time ends and the planning handoff begins.</small></span>
        </label>
      </div>
      <div className="button-row settings-tests">
        <button className="secondary-button" disabled={!!testing} onClick={() => test("start")}>
          <Volume2 size={16} /> {testing === "start" ? "Playing…" : "Test start sound"}
        </button>
        <button className="secondary-button" disabled={!!testing} onClick={() => test("end")}>
          <Volume2 size={16} /> {testing === "end" ? "Playing…" : "Test end sound"}
        </button>
      </div>
      <p className="sound-status" role="status">{feedback || audio.message}</p>
      <p className="card-desc">Your choices save automatically. Keep Study Orbit open and your device awake. Click Test sound after reopening the app if your browser blocks audio. Muted tabs, device sleep, and browser background limits can delay or prevent alerts; sounds cannot play after the app is closed.</p>
    </section>
  );
}
