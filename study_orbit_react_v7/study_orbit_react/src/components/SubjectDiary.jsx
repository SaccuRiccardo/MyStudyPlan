import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpen, CheckCircle2, History, Plus, Save } from "lucide-react";
import { uid } from "../lib/planner.js";
import {
  dateKey,
  displayDate,
  formatSlotTime,
  mondayFor,
  parseDate,
  shiftDate,
} from "../lib/time.js";

const entryIdentity = (entry) =>
  entry?.id ||
  (entry?.slotId ? `${entry.phaseId}:${entry.date}:${entry.slotId}` : "new");

function savedTime(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "Earlier saved version";
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function sessionTime(entry) {
  return Number.isFinite(entry.start) && Number.isFinite(entry.end)
    ? `${formatSlotTime(entry.start)}–${formatSlotTime(entry.end)}`
    : "Independent study entry";
}

/** Keep each dated session's saved text and previous versions visible for recall. */
function DiaryEntry({ entry, onEdit, disabled }) {
  return (
    <article className="diary-entry">
      <div className="diary-entry-heading">
        <div>
          <h3>{displayDate(parseDate(entry.date))}</h3>
          <p>{sessionTime(entry)} · {entry.phaseName || "No phase"}</p>
        </div>
        <span className={`diary-status ${entry.done ? "is-done" : ""}`}>
          {entry.done ? "Completed" : "In progress"}
        </span>
      </div>
      {entry.goal && <p><strong>Session goal:</strong> {entry.goal}</p>}
      <div className="diary-entry-content">
        <div>
          <h4>What I studied</h4>
          <p>{entry.work || "No study notes recorded yet."}</p>
        </div>
        <div>
          <h4>Next step saved with this session</h4>
          <p>{entry.nextStep || "No next step recorded for this session."}</p>
        </div>
      </div>
      <div className="diary-entry-actions">
        <small>{entry.updatedAt ? `Last saved ${savedTime(entry.updatedAt)}` : "Imported from existing session progress"}</small>
        <button
          className="secondary-button"
          type="button"
          disabled={disabled}
          aria-label={`Edit entry for ${displayDate(parseDate(entry.date))}, ${sessionTime(entry)}`}
          onClick={() => onEdit(entry)}
        >
          Edit entry
        </button>
      </div>
      {!!entry.revisions?.length && (
        <details className="diary-revisions">
          <summary><History size={15} /> Saved history ({entry.revisions.length} {entry.revisions.length === 1 ? "version" : "versions"})</summary>
          {[...entry.revisions].reverse().map((revision, index) => (
            <div className="diary-revision" key={`${revision.savedAt}-${index}`}>
              <strong>{savedTime(revision.savedAt)}</strong>
              <span className="diary-revision-status">{revision.done ? "Completed" : "In progress"}</span>
              {revision.goal && <p><strong>Goal:</strong> {revision.goal}</p>}
              <p><strong>Studied:</strong> {revision.work || "No study notes in this version."}</p>
              <p><strong>Next step:</strong> {revision.nextStep || "No next step in this version."}</p>
            </div>
          ))}
        </details>
      )}
    </article>
  );
}

/** A subject's diary is independent of the active timetable and its ten-minute handoff. */
export default function SubjectDiary({
  subject,
  subjects = [],
  entries = [],
  handoff,
  selection,
  phases = [],
  onSelectSubject,
  onSaveEntry,
  onSelectEntry,
  onBack,
  onDirtyChange,
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [dirty, setDirty] = useState(false);
  const [nextStepTouched, setNextStepTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const nextStepRef = useRef(null);
  const saveGeneration = useRef(0);

  function makeDraft(context = selection) {
    const existing = context && entries.find((entry) => entryIdentity(entry) === entryIdentity(context));
    const source = existing || context || {};
    return {
      id: source.id || (source.slotId ? `${source.phaseId}:${source.date}:${source.slotId}` : uid()),
      subjectId: subject?.id,
      subjectName: subject?.name || "Subject",
      phaseId: source.phaseId || null,
      phaseName: source.phaseName || "",
      date: source.date || dateKey(new Date()),
      slotId: source.slotId || null,
      start: Number.isFinite(source.start) ? source.start : null,
      end: Number.isFinite(source.end) ? source.end : null,
      work: source.work || "",
      nextStep: source.nextStep || "",
      done: !!source.done,
      goal: source.goal || "",
      createdAt: source.createdAt || null,
    };
  }

  const [draft, setDraft] = useState(() => makeDraft());
  const selectedIdentity = `${subject?.id || ""}:${entryIdentity(selection)}:${selection?.navigationKey || ""}`;
  // Saving refreshes entries in the parent; only navigation replaces the open draft.
  useEffect(() => {
    saveGeneration.current += 1;
    setDraft(makeDraft());
    setDirty(false);
    setNextStepTouched(false);
    setSaving(false);
    setError("");
    setMessage("");
  }, [selectedIdentity]);

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const filterPhases = useMemo(() => {
    const found = new Map(phases.map((phase) => [phase.id, phase.name]));
    for (const entry of entries)
      if (entry.phaseId && !found.has(entry.phaseId))
        found.set(entry.phaseId, entry.phaseName || "Earlier phase");
    return [...found.entries()];
  }, [phases, entries]);
  const invalidRange = !!(from && to && from > to);
  const filtered = useMemo(() => entries.filter((entry) =>
    (!from || entry.date >= from) &&
    (!to || entry.date <= to) &&
    (phaseFilter === "all" || (phaseFilter === "none" ? !entry.phaseId : entry.phaseId === phaseFilter)),
  ).sort((a, b) => b.date.localeCompare(a.date) || (b.start ?? -1) - (a.start ?? -1) || (b.updatedAt || "").localeCompare(a.updatedAt || "")), [entries, from, to, phaseFilter]);

  function update(field, value) {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setDirty(true);
    setMessage("");
    if (field === "nextStep") setNextStepTouched(true);
  }

  function canLeave() {
    return !saving && (!dirty || window.confirm("Leave this study log without saving your changes?"));
  }

  function addEntry() {
    if (!canLeave()) return;
    setDraft(makeDraft(null));
    setDirty(false);
    setNextStepTouched(false);
    setMessage("");
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    if (!draft.date) return setError("Choose the study date.");
    setSaving(true);
    setError("");
    const generation = saveGeneration.current;
    const patch = { work: draft.work, done: draft.done, goal: draft.goal };
    if (nextStepTouched) patch.nextStep = draft.nextStep;
    try {
      const saved = await onSaveEntry(draft, patch);
      if (generation !== saveGeneration.current) return;
      setDraft((current) => ({ ...current, createdAt: saved?.createdAt || current.createdAt }));
      setDirty(false);
      setNextStepTouched(false);
      setMessage("Study log saved locally. This version is in your diary history.");
    } catch (failure) {
      if (generation === saveGeneration.current)
        setError(failure.message || "Could not save the study log. Try again.");
    } finally {
      if (generation === saveGeneration.current) setSaving(false);
    }
  }

  if (!subject) return (
    <section className="panel section-panel subject-diary">
      <h2>Study diary</h2>
      <p>Add a subject in the subject library to start keeping a study diary.</p>
      <button type="button" className="secondary-button" onClick={onBack}>Back to subjects</button>
    </section>
  );

  const metadataLocked = !!(draft.slotId || draft.createdAt || entries.some((entry) => entry.id === draft.id));
  return (
    <section className="panel section-panel subject-diary" aria-labelledby="subjectDiaryTitle">
      <div className="diary-heading">
        <div>
          <span className="panel-overline"><BookOpen size={16} /> YOUR STUDY DIARY</span>
          <h2 id="subjectDiaryTitle">{subject.name}</h2>
          <p>Record each session, return to any date, and revisit what you learned.</p>
        </div>
        <button className="secondary-button" type="button" disabled={saving} onClick={() => { if (canLeave()) onBack(); }}>
          <ArrowLeft size={15} /> Back to calendar
        </button>
      </div>
      <label className="diary-subject-select">
        Subject
        <select aria-label="Diary subject" value={subject.id} disabled={saving} onChange={(event) => { if (canLeave()) onSelectSubject(event.target.value); }}>
          {subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>

      <aside className="diary-next-plan">
        <div>
          <strong>Current plan for the next session</strong>
          <p>{handoff?.text || "No next step saved yet."}</p>
        </div>
        <button className="text-button" type="button" onClick={() => nextStepRef.current?.focus()}>
          Update next step below
        </button>
      </aside>

      <form className="diary-form" onSubmit={submit}>
        <div className="diary-section-heading">
          <h3>{metadataLocked ? "Session study log" : "Add a study log"}</h3>
          <button type="button" className="secondary-button" disabled={saving} onClick={addEntry}><Plus size={14} /> Add diary entry</button>
        </div>
        <div className="diary-form-meta">
          <label>
            Study date
            <input type="date" required value={draft.date} disabled={metadataLocked || saving} onChange={(event) => update("date", event.target.value)} />
          </label>
          <label>
            Phase
            <select aria-label="Study log phase" value={draft.phaseId || ""} disabled={metadataLocked || saving} onChange={(event) => {
              const phase = phases.find((item) => item.id === event.target.value);
              setDraft((current) => ({ ...current, phaseId: phase?.id || null, phaseName: phase?.name || "" }));
              setDirty(true);
              setMessage("");
            }}>
              <option value="">No phase</option>
              {draft.phaseId && !phases.some((item) => item.id === draft.phaseId) && <option value={draft.phaseId}>{draft.phaseName || "Earlier phase"}</option>}
              {phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}
            </select>
          </label>
          <p>{sessionTime(draft)}</p>
        </div>
        <label>
          Session goal
          <input value={draft.goal} disabled={saving} maxLength={180} placeholder="What did you want to understand or practise?" onChange={(event) => update("goal", event.target.value)} />
        </label>
        <label>
          What I studied / did today
          <textarea aria-label="What I studied / did today" value={draft.work} disabled={saving} rows={5} placeholder="Topics, exercises, questions, and what you understood…" onChange={(event) => update("work", event.target.value)} />
        </label>
        <label>
          Next steps
          <textarea aria-label="Next steps" ref={nextStepRef} value={draft.nextStep} disabled={saving} rows={3} placeholder="One clear starting point for your next session…" onChange={(event) => update("nextStep", event.target.value)} />
        </label>
        <p className="diary-form-hint">Editing next steps here updates the plan shown in your next session, even after the ten-minute handoff. Saving other fields keeps your current next-session plan.</p>
        <label className="diary-completion-toggle">
          <input type="checkbox" checked={draft.done} disabled={saving} onChange={(event) => update("done", event.target.checked)} />
          Mark this session completed
        </label>
        <div className="diary-save-row">
          <button type="submit" className="primary-button" disabled={saving}><Save size={16} /> {saving ? "Saving…" : "Save study log"}</button>
          <span>{dirty ? "Unsaved changes" : "Save a version whenever you update this log."}</span>
        </div>
        {message && <p className="diary-save-message" role="status"><CheckCircle2 size={16} /> {message}</p>}
        {error && <p className="diary-error" role="alert">{error}</p>}
      </form>

      <div className="diary-history">
        <div className="diary-section-heading">
          <div>
            <h3>Study history</h3>
            <p>Filter any period for recall or review. Dates include both endpoints.</p>
          </div>
          <strong>{filtered.length} of {entries.length} {entries.length === 1 ? "entry" : "entries"}</strong>
        </div>
        <div className="diary-filters">
          <label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <label>Phase<select aria-label="Filter diary by phase" value={phaseFilter} onChange={(event) => setPhaseFilter(event.target.value)}>
            <option value="all">All phases</option>
            <option value="none">No phase</option>
            {filterPhases.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select></label>
          <button type="button" className="secondary-button" onClick={() => {
            const monday = mondayFor(new Date());
            setFrom(dateKey(monday));
            setTo(dateKey(shiftDate(monday, 6)));
          }}>This week</button>
          <button type="button" className="secondary-button" onClick={() => { setFrom(""); setTo(""); }}>All dates</button>
        </div>
        {invalidRange ? <p className="diary-error" role="alert">Choose a From date that is on or before the To date.</p> : filtered.length ? (
          <div className="diary-entries">
            {filtered.map((entry) => <DiaryEntry key={entry.id} entry={entry} disabled={saving} onEdit={(item) => { if (canLeave()) onSelectEntry(item); }} />)}
          </div>
        ) : <p className="empty-small">{entries.length ? "No study entries match these dates and phase." : "Your diary starts with your first saved study log. Earlier completion and goals appear here when available."}</p>}
      </div>
    </section>
  );
}
