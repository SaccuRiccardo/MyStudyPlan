import { useState, useSyncExternalStore } from "react";
import { BellRing, Volume2 } from "lucide-react";
import FilePicker from "./FilePicker.jsx";
import {
  getSessionAudioStatus,
  playSessionSound,
  subscribeSessionAudioStatus,
  unlockSessionAudio,
  readSoundFile,
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
      await playSessionSound(kind, settings);
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
      <p className="card-desc">Hear a clear alert when a session starts or ends, even while you use another tab.</p>
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
      <div className="sound-settings">
        <label className="sound-setting"><span><strong>Alert volume: {Math.round((settings.soundVolume ?? 0.8) * 100)}%</strong>
          <input aria-label="Alert volume" type="range" min="0" max="1" step="0.05" value={settings.soundVolume ?? 0.8} onChange={(e) => onChange({ ...settings, soundVolume: Number(e.target.value) })} />
        </span></label>
        <div className="sound-setting"><div className="sound-upload-copy"><strong>Upload your own sound</strong><small>Audio files up to 1 MB. Plays up to 15 seconds at both enabled boundaries. Saved locally and included in backups.</small>
          <FilePicker label={testing === "upload" ? "Reading sound…" : "Choose audio file"} fileName={settings.customSound?.name} hint="MP3, WAV or OGG · up to 1 MB" accept="audio/*" disabled={!!testing} onChange={async (e) => {
            const file = e.target.files?.[0]; e.target.value = "";
            if (!file) return;
            setTesting("upload");
            try { const customSound = await readSoundFile(file); onChange({ ...settings, customSound }); setFeedback("Sound saved. Use a test button to preview it."); }
            catch (error) { setFeedback(error.message || "This audio format could not be decoded."); }
            finally { setTesting(""); }
          }} />
        </div></div>
        {settings.customSound && <div><button className="secondary-button" onClick={() => onChange({ ...settings, customSound: null })}>Use default alert</button></div>}
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
