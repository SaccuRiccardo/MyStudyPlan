import { useEffect, useState } from "react";
import { Play, Pause, RotateCcw, SkipForward, Headphones, CloudRain, Waves, Wind, Volume2, VolumeX, SlidersHorizontal, CheckCircle2, ArrowRight } from "lucide-react";

const modes = [["focus", "Focus"], ["shortBreak", "Short break"], ["longBreak", "Long break"]];
const sounds = [
  ["brown", "Brown noise", "Deep & steady", Waves],
  ["white", "White noise", "Bright & even", Wind],
  ["pink", "Pink noise", "Soft & balanced", Waves],
  ["rain", "Rain", "A gentle downpour", CloudRain],
  ["off", "Quiet", "Just your timer", VolumeX],
];
const clock = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

export default function Pomodoro({ timer, preferences, onPreferences, ambience, onStart, subject, sessionEnd }) {
  const [draft, setDraft] = useState(preferences);
  const [configError, setConfigError] = useState("");
  useEffect(() => { setDraft(preferences); }, [preferences.focusMinutes, preferences.shortBreakMinutes, preferences.longBreakMinutes, preferences.longBreakEvery, preferences.autoStartBreaks, preferences.autoStartFocus, preferences.soundEnabled]);
  const completedInCycle = timer.completedFocus % preferences.longBreakEvery;
  const progress = Math.max(0, Math.min(1, 1 - timer.remainingSeconds / timer.totalSeconds));
  const currentMode = modes.find(([id]) => id === timer.mode)?.[1];
  const update = (patch) => onPreferences({ ...preferences, ...patch });
  const apply = (event) => {
    event.preventDefault();
    const timerFields = ["focusMinutes", "shortBreakMinutes", "longBreakMinutes", "longBreakEvery", "autoStartBreaks", "autoStartFocus", "soundEnabled"];
    const result = onPreferences({ ...preferences, ...Object.fromEntries(timerFields.map((field) => [field, draft[field]])) });
    setConfigError(result || "");
  };
  return (
    <section className="pomodoro-page" aria-labelledby="pomodoroTitle">
      <div className="pomodoro-heading">
        <div><span className="panel-overline">ONE INTERVAL AT A TIME</span><h2 id="pomodoroTitle">Find your focus.</h2><p>A little structure. A calmer soundtrack. Space to think.</p></div>
        <span className="pomodoro-session"><span className={subject ? "pulse-dot" : ""} />{subject ? `Studying ${subject}` : "Your own study rhythm"}</span>
      </div>
      <div className={`panel pomodoro-timer ${timer.mode !== "focus" ? "is-break" : ""}`}>
        <div className="pomodoro-mode-tabs" role="group" aria-label="Timer interval">
          {modes.map(([id, label]) => <button key={id} aria-pressed={timer.mode === id} className={timer.mode === id ? "active" : ""} onClick={() => { ambience.stopPreview(); timer.selectMode(id); }}>{label}</button>)}
        </div>
        <div className="pomodoro-dial">
          <svg viewBox="0 0 260 260" aria-hidden="true"><circle className="dial-track" cx="130" cy="130" r="119" /><circle className="dial-progress" cx="130" cy="130" r="119" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - progress * 100} /></svg>
          <div><span className="small-label">{timer.running ? currentMode.toUpperCase() : "READY WHEN YOU ARE"}</span><span className="pomodoro-time" role="timer" aria-label={`${currentMode}: ${clock(timer.remainingSeconds)} remaining`}>{clock(timer.remainingSeconds)}</span><span className="pomodoro-dial-caption">{timer.mode === "focus" ? "One thing deserves your attention." : "Step away. Let it settle."}</span></div>
        </div>
        <div className="pomodoro-controls">
          <button className="icon-button" aria-label="Reset current interval" title="Reset interval" onClick={() => { ambience.stopPreview(); timer.reset(); }}><RotateCcw size={18} /></button>
          <button className="primary-button pomodoro-start" onClick={() => { if (timer.running) { ambience.stopPreview(); timer.pause(); } else onStart(); }}>{timer.running ? <Pause size={19} /> : <Play size={19} />}{timer.running ? "Pause" : "Start timer"}</button>
          <button className="icon-button" aria-label="Skip to next interval" title="Skip interval" onClick={() => { ambience.stopPreview(); timer.skip(); }}><SkipForward size={19} /></button>
        </div>
        <div className="pomodoro-rounds"><div aria-label={`${completedInCycle} of ${preferences.longBreakEvery} focus intervals in this cycle`}>{Array.from({ length: preferences.longBreakEvery }, (_, i) => <span className={i < completedInCycle ? "complete" : ""} key={i}><CheckCircle2 size={16} /></span>)}</div><p>{timer.completedFocus} focus {timer.completedFocus === 1 ? "interval" : "intervals"} completed · long break every {preferences.longBreakEvery}</p></div>
        <p className="pomodoro-note" role="status">{timer.running ? "Your timer keeps going as you browse the workspace." : "Start when ready. Your timer stays here as you move around."}{sessionEnd && ` Your scheduled session ends at ${sessionEnd.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.`}</p>
      </div>
      <section className="panel section-panel pomodoro-soundscape" aria-labelledby="soundscapeTitle">
        <div className="section-top"><div><span className="panel-overline">SET THE ATMOSPHERE</span><h3 id="soundscapeTitle"><Headphones size={18} /> Your soundscape</h3></div><span className={`soundscape-status ${ambience.playing ? "playing" : ""}`}>{ambience.playing ? "● Playing" : "Paused"}</span></div>
        <div className="soundscape-options" role="group" aria-label="Background sound">
          {sounds.map(([id, label, description, Icon]) => <button key={id} aria-pressed={preferences.ambient === id} className={preferences.ambient === id ? "selected" : ""} onClick={() => update({ ambient: id })}><Icon size={23} /><strong>{label}</strong><small>{description}</small></button>)}
        </div>
        <div className="soundscape-bottom"><label className="soundscape-volume"><Volume2 size={17} /><span>Volume</span><input aria-label="Background sound volume" type="range" min="0" max="1" step="0.05" value={preferences.ambientVolume} onChange={(e) => update({ ambientVolume: Number(e.target.value) })} /><output>{Math.round(preferences.ambientVolume * 100)}%</output></label><button className="secondary-button" disabled={preferences.ambient === "off"} onClick={ambience.toggle}>{ambience.playing ? <Pause size={15} /> : <Play size={15} />}{ambience.playing ? "Pause sound" : timer.running ? "Enable sound" : "Preview sound"}</button></div>
        <label className="pomodoro-check"><input type="checkbox" checked={preferences.ambientDuringBreaks} onChange={(e) => update({ ambientDuringBreaks: e.target.checked })} />Keep background sound during breaks</label>
        <p className="pomodoro-note">Sounds are generated on your device, including a rain-like texture. No streaming or downloads. Pausing the timer pauses its soundtrack; use Preview sound to listen on its own.</p>
        {ambience.error && <p className="form-error" role="alert">{ambience.error}</p>}
      </section>
      <details className="panel pomodoro-settings"><summary><SlidersHorizontal size={17} /> Timer settings <span>Make this rhythm yours</span></summary>
        <form onSubmit={apply}>
          <div className="pomodoro-duration-fields">{[["focusMinutes", "Focus minutes", 180], ["shortBreakMinutes", "Short break minutes", 60], ["longBreakMinutes", "Long break minutes", 120], ["longBreakEvery", "Focus intervals before long break", 12]].map(([field, label, max]) => <label key={field}>{label}<input type="number" required min="1" max={max} step="1" value={draft[field]} onChange={(e) => setDraft({ ...draft, [field]: e.target.value === "" ? "" : Number(e.target.value) })} /></label>)}</div>
          <div className="pomodoro-preference-checks">{[["autoStartBreaks", "Start breaks automatically"], ["autoStartFocus", "Start the next focus interval automatically"], ["soundEnabled", "Play an alert when an interval ends"]].map(([field, label]) => <label className="pomodoro-check" key={field}><input type="checkbox" checked={draft[field]} onChange={(e) => setDraft({ ...draft, [field]: e.target.checked })} />{label}</label>)}</div>
          <div className="pomodoro-settings-footer"><p>Duration changes apply to the next interval if the timer is running. Alert sounds use your Settings volume and custom sound.</p><button className="primary-button" type="submit">Save timer settings <ArrowRight size={14} /></button></div>
          {configError && <p className="form-error" role="alert">{configError}</p>}
        </form>
      </details>
    </section>
  );
}
