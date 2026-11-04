import { roundHalfHours, isHalfHourGoal } from "../lib/halfHours.js";
import AvailabilityEditor from "./AvailabilityEditor.jsx";
import {
  availableHours,
  starterWindows,
  presetErrors,
  studyWindows,
} from "../lib/availability.js";
import {
  useAvailability,
  suggestForAvailability,
  adaptToAvailability,
  flexibleErrors,
  planningWarnings,
} from "../lib/flexiblePlanner.js";
import { useDialog } from "../hooks/useDialog.js";
import { useState, useRef } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  Trash2,
  LockKeyhole,
  Unlock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { DAYS, duration, formatHours, formatSlotTime } from "../lib/time.js";
import {
  clone,
  freshPhase,
  flexibleStudySubject,
  priorityLabel,
  STUDY_PRIORITIES,
  forgetAutoFillGroup,
  hoursBySubject,
  scheduledHours,
  subjectName,
  SUBJECT_COLORS,
  targetSum,
  TIERS,
  uid,
} from "../lib/planner.js";

const STEPS = [
  "Availability",
  "Subjects",
  "Priorities",
  "Study needs",
  "Timetable",
  "Review",
];
/** @brief Split study-day minutes into a clock input and explicit day offset. */
function timeParts(value) {
  return {
    time: `${String(Math.floor((value % 1440) / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`,
    offset: String(Math.floor(value / 1440)),
  };
}
/** @brief Give each planner step a clear task heading. */
function title(step) {
  if (step === -1) return "When can you study this semester?";
  return [
    "What are you studying?",
    "Choose your study effort",
    "What does each subject need?",
    "Create your weekly rhythm",
    "Does the plan feel right?",
  ][step];
}
/** @brief Explain the decision the user makes at each planner step. */
function description(step) {
  if (step === -1)
    return "Start with a saved preset or build a week from scratch. Block lectures, commuting and other unavailable time. You can change these constraints later.";
  return [
    "Add any course, project or regular study activity. Choose from your library or add a new subject. Renaming a subject updates its name everywhere.",
    "Choose how much attention each subject needs. Higher priorities receive more suggested weekly time; you can always adjust the hours.",
    "Enter your own weekly goals, or request suggested hours. Continuing does not generate or replace sessions.",
    "Adjust the start and end times freely. +1 day supports studying after midnight.",
    "Review your available time, subject goals and proposed sessions. A partial plan is fine; conflicts still need correcting.",
  ][step];
}

/** @brief Keep an independent availability-first semester draft; unmet goals remain warnings, not save barriers. */
export default function PhasePlanner({
  initialPhase,
  library = [],
  presets = [],
  initialPreset = null,
  onSavePreset,
  mode,
  onSave,
  onClose,
}) {
  const [draft, setDraft] = useState(() => {
    const phase = initialPhase ? clone(initialPhase) : freshPhase();
    phase.targetHours = Object.fromEntries(
      phase.subjects.map((subject) => [
        subject.id,
        roundHalfHours(phase.targetHours[subject.id] || 0),
      ]),
    );
    if (!phase.availability) {
      const windows = initialPhase
        ? phase.slots
            .filter((slot) => !slot.fixed && !slot.protected)
            .map((slot) => ({
              id: uid(),
              day: slot.day,
              start: slot.start,
              end: slot.end,
              kind: "study",
            }))
        : [];
      return useAvailability(
        phase,
        initialPreset || { name: "My semester week", windows },
      );
    }
    return { ...phase, planningMode: "flexible" };
  });
  const [step, setStep] = useState(mode === "duplicate" ? 4 : -1);
  const [visited, setVisited] = useState(mode === "create" ? -1 : 4);
  const [subjectText, setSubjectText] = useState("");
  const [presetNotice, setPresetNotice] = useState("");
  const [error, setError] = useState("");
  const [fillNotice, setFillNotice] = useState("");
  const [filling, setFilling] = useState(false);
  /** @brief Apply an isolated edit to the current planner draft. */
  const update = (fn) => {
    setDraft((current) => {
      const next = clone(current);
      return fn(next) || next;
    });
    setError("");
  };
  /** @brief Confirm before discarding unsaved planner configuration. */
  const close = () => {
    if (window.confirm("Close the planner? Unsaved changes will be lost."))
      onClose();
  };
  /** @brief Add a new subject or reuse its existing library identity. */
  const addSubject = (event) => {
    event.preventDefault();
    const name = subjectText.trim();
    if (!name) return;
    if (draft.subjects.some((s) => s.name.toLowerCase() === name.toLowerCase()))
      return setError("That subject already exists.");
    const shared = library.find(
      (s) => s.name.toLowerCase() === name.toLowerCase(),
    );
    update((d) => {
      const id = shared?.id || uid();
      d.subjects.push(
        shared
          ? clone(shared)
          : {
              id,
              name,
              tier: "A",
              color: SUBJECT_COLORS[d.subjects.length % SUBJECT_COLORS.length],
            },
      );
      d.targetHours[id] = 0;
    });
    setSubjectText("");
  };
  /** @brief Remove a phase member while guarding protected commitments. */
  const removeSubject = (subject) => {
    if (draft.slots.some((s) => s.protected && s.subjectId === subject.id))
      return setError("A protected mandatory block uses this subject.");
    update((d) => {
      for (const slot of d.slots.filter((s) => s.subjectId === subject.id))
        forgetAutoFillGroup(d, slot.id);
      d.subjects = d.subjects.filter((s) => s.id !== subject.id);
      d.slots = d.slots.filter((s) => s.subjectId !== subject.id);
      delete d.targetHours[subject.id];
    });
  };
  /** @brief Edit a flexible block and discard stale auto-fill capacity metadata. */
  const changeSlot = (slotId, patch) => {
    const slot = draft.slots.find((item) => item.id === slotId);
    if (!slot || slot.protected || (slot.fixed && patch.fixed !== false))
      return;
    if (
      patch.fixed &&
      (slot.end <= slot.start || (slot.end - slot.start) % 30 !== 0)
    )
      return setError(
        "Use a whole or half-hour duration before locking this session.",
      );
    update((d) => {
      const item = d.slots.find((item) => item.id === slotId);
      forgetAutoFillGroup(d, slotId);
      Object.assign(item, patch);
    });
    setFillNotice("");
  };
  /** @brief Convert the time input and day offset into study-day minutes. */
  const changeTime = (slot, field, time, offset) => {
    if (!time) return;
    const [h, m] = time.split(":").map(Number);
    changeSlot(slot.id, { [field]: Number(offset) * 1440 + h * 60 + m });
  };
  /** @brief Append an editable block to the selected study day. */
  const addSlot = (day) => {
    const available = studyWindows(
      draft.availability?.windows || [],
      draft.slots,
    ).find((window) => window.day === day && window.end - window.start >= 30);
    if (!available)
      return setError(
        "No free study availability on that day. Add or extend availability first.",
      );
    update((d) => {
      d.slots.push({
        id: uid(),
        day,
        start: available.start,
        end: Math.min(available.start + 120, available.end),
        subjectId: d.subjects[0]?.id || "",
        fixed: false,
      });
    });
  };
  const selectSubject = (subject) => {
    if (draft.subjects.some((item) => item.id === subject.id)) {
      removeSubject(subject);
    } else {
      update((phase) => {
        phase.subjects.push(clone(subject));
        phase.targetHours[subject.id] = 0;
      });
    }
  };
  const flexibleSubject =
    draft.subjects.find((subject) => subject.kind === "flexible") ||
    library.find((subject) => subject.kind === "flexible");
  const dialogRef = useRef(null);
  useDialog(dialogRef, close);
  /** @brief Search for a fill after painting feedback; locks are validated and preserved verbatim. */
  const fill = async () => {
    const locked = draft.slots.filter((slot) => slot.fixed || slot.protected);
    const errors = flexibleErrors({
      ...draft,
      name: draft.name || "Draft",
      slots: locked,
    });
    if (errors.length) return setError(errors[0]);
    setFilling(true);
    setError("");
    setFillNotice("");
    try {
      await new Promise((resolve) =>
        requestAnimationFrame(() => setTimeout(resolve, 0)),
      );
      const next = adaptToAvailability(draft);
      setDraft(next);
      setStep(3);
      setVisited((value) => Math.max(3, value));
      setFillNotice(
        `Filled ${formatHours(scheduledHours(next))}h, favoring 2h+ sessions with a 90-minute minimum. ${locked.length} locked session${locked.length === 1 ? "" : "s"} kept. Review any unmet goals below.`,
      );
    } catch (error) {
      setError(`Could not fill the timetable: ${error.message}`);
    } finally {
      setFilling(false);
    }
  };
  /** @brief Validate each wizard stage and save only a consistent final plan. */
  const goNext = () => {
    if (step === -1) {
      const errors = presetErrors(draft.availability);
      if (errors.length) return setError(errors[0]);
    }
    if (step === 0 && !draft.subjects.length)
      return setError("Add at least one subject.");
    if (step === 2) {
      if (
        draft.subjects.some(
          (subject) => !isHalfHourGoal(draft.targetHours[subject.id]),
        )
      )
        return setError(
          "Use whole or half hours for each subject (12, 12.5, 13…).",
        );
    }
    if (step === 4) {
      const errors = flexibleErrors(draft);
      if (errors.length) return setError(errors[0]);
      onSave({ ...draft, totalTarget: targetSum(draft) });
      return;
    }
    setStep((value) => value + 1);
    setVisited((value) => Math.max(value, step + 1));
    setError("");
  };
  const actual = hoursBySubject(draft);
  const issues = flexibleErrors({ ...draft, name: draft.name || "Draft" });
  const warnings = planningWarnings(draft);
  const capacity = availableHours(draft.availability.windows);
  return (
    <div className="dialog-backdrop planner-backdrop">
      <section
        className="planner-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plannerHeading"
      >
        <div className="planner-header">
          <div>
            <span className="dialog-caption">STUDY ORBIT · PHASE BUILDER</span>
            <h2 id="plannerHeading">
              {mode === "edit"
                ? "Edit study phase"
                : mode === "duplicate"
                  ? "Duplicate study phase"
                  : "Create study phase"}
            </h2>
          </div>
          <button
            className="close-button"
            onClick={close}
            disabled={filling}
            aria-label="Close planner"
          >
            <X size={20} />
          </button>
        </div>
        <div className="step-navigation">
          {STEPS.map((name, index) => (
            <button
              key={name}
              type="button"
              disabled={filling || index - 1 > visited}
              className={index - 1 === step ? "active" : ""}
              onClick={() => {
                setStep(index - 1);
                setError("");
              }}
            >
              <span>{index + 1}</span>
              <strong>{name}</strong>
            </button>
          ))}
        </div>
        <div className="planner-content" inert={filling}>
          <div className="step-heading">
            <h3>{title(step)}</h3>
            <p>{description(step)}</p>
          </div>
          {step === -1 && (
            <>
              <div className="preset-bar">
                <label>
                  Use a saved preset
                  <select
                    aria-label="Use a saved preset"
                    value=""
                    onChange={(event) => {
                      const selected = presets.find(
                        (preset) => preset.id === event.target.value,
                      );
                      if (selected) {
                        setDraft((current) =>
                          useAvailability(current, selected),
                        );
                        setPresetNotice("Preset copied into this phase.");
                      }
                    }}
                  >
                    <option value="">Choose a preset…</option>
                    {presets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() =>
                    update((phase) => {
                      phase.availability.windows = starterWindows("classic");
                    })
                  }
                >
                  Start with 3 + 2 + 2
                </button>
                <button
                  onClick={() =>
                    update((phase) => {
                      phase.availability.windows = starterWindows("night");
                    })
                  }
                >
                  Night owl
                </button>
              </div>
              <label className="phase-name-label">
                Week / preset name
                <input
                  value={draft.availability.name}
                  maxLength={90}
                  onChange={(event) =>
                    update((phase) => {
                      phase.availability.name = event.target.value;
                    })
                  }
                />
              </label>
              <label className="phase-name-label">
                Study needs / constraints
                <textarea
                  rows={2}
                  value={draft.availability.notes || ""}
                  maxLength={1000}
                  onChange={(event) =>
                    update((phase) => {
                      phase.availability.notes = event.target.value;
                    })
                  }
                  placeholder="Keep weekends light; university hours may change…"
                />
              </label>
              <AvailabilityEditor
                windows={draft.availability.windows}
                onChange={(windows) =>
                  update((phase) => {
                    phase.availability.windows = windows;
                  })
                }
              />
              <div className="edit-buttons">
                <button
                  onClick={() => {
                    const errors = presetErrors(draft.availability);
                    if (errors.length) return setError(errors[0]);
                    onSavePreset({ id: uid(), ...clone(draft.availability) });
                    setPresetNotice(
                      "Saved a reusable preset. You can keep building this phase.",
                    );
                  }}
                >
                  Save a copy as preset
                </button>
              </div>
              {presetNotice && (
                <p role="status" className="form-success">
                  {presetNotice}
                </p>
              )}
            </>
          )}
          {step === 0 && (
            <>
              {library.some((subject) => subject.kind !== "flexible") && (
                <div className="subject-picker-section">
                  <h4>Choose from your library</h4>
                  <p>
                    Click a card to include or remove a subject in this phase.
                  </p>
                  <div
                    className="subject-picker"
                    aria-label="Subjects from your library"
                  >
                    {library
                      .filter((subject) => subject.kind !== "flexible")
                      .map((subject) => {
                        const selected = draft.subjects.some(
                          (item) => item.id === subject.id,
                        );
                        return (
                          <button
                            type="button"
                            key={subject.id}
                            className={`subject-choice ${selected ? "is-selected" : ""}`}
                            aria-pressed={selected}
                            onClick={() => selectSubject(subject)}
                          >
                            <span
                              className="subject-swatch"
                              style={{ background: subject.color }}
                            />
                            <span className="subject-choice-copy">
                              <strong>{subject.name}</strong>
                              <small>
                                {selected
                                  ? "Included in this phase"
                                  : "Add to this phase"}
                              </small>
                            </span>
                            <span
                              className="subject-choice-check"
                              aria-hidden="true"
                            >
                              {selected ? (
                                <CheckCircle2 size={22} />
                              ) : (
                                <Plus size={22} />
                              )}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
              <button
                type="button"
                className={`subject-choice flexible-study-choice ${draft.subjects.some((subject) => subject.kind === "flexible") ? "is-selected" : ""}`}
                aria-pressed={draft.subjects.some(
                  (subject) => subject.kind === "flexible",
                )}
                onClick={() =>
                  selectSubject(flexibleSubject || flexibleStudySubject())
                }
              >
                <span className="subject-choice-copy">
                  <strong>Flexible study time</strong>
                  <small>
                    Reserve time for any subject. Set its weekly hours alongside
                    your courses.
                  </small>
                </span>
                <span className="subject-choice-check" aria-hidden="true">
                  {draft.subjects.some(
                    (subject) => subject.kind === "flexible",
                  ) ? (
                    <CheckCircle2 size={22} />
                  ) : (
                    <Plus size={22} />
                  )}
                </span>
              </button>
              <form
                className="add-subject planner-add-subject"
                onSubmit={addSubject}
              >
                <label htmlFor="newSubjectName">
                  Add a new subject
                  <input
                    id="newSubjectName"
                    value={subjectText}
                    maxLength={75}
                    onChange={(e) => setSubjectText(e.target.value)}
                    placeholder="Course name, e.g. Linear Algebra"
                  />
                </label>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={!subjectText.trim()}
                >
                  <Plus size={18} /> Add subject
                </button>
              </form>
              <h4 className="selected-subjects-heading">
                In this phase <span>{draft.subjects.length}</span>
              </h4>
              <div className="editor-list">
                {draft.subjects.map((subject) => (
                  <div className="subject-editor" key={subject.id}>
                    <span
                      className="subject-swatch"
                      style={{ background: subject.color }}
                    />
                    <input
                      className="subject-name-input"
                      aria-label={`${subject.name} name`}
                      value={subject.name}
                      onChange={(e) =>
                        update((d) => {
                          d.subjects.find((s) => s.id === subject.id).name =
                            e.target.value;
                        })
                      }
                    />
                    <small>
                      {subject.kind === "flexible"
                        ? "Any subject"
                        : priorityLabel(subject.tier)}{" "}
                      · {formatHours(draft.targetHours[subject.id])}h
                    </small>
                    <button
                      className="subject-remove"
                      aria-label={`Remove ${subject.name} from this phase`}
                      title="Remove subject"
                      onClick={() => removeSubject(subject)}
                    >
                      <Trash2 size={17} /> <span>Remove</span>
                    </button>
                  </div>
                ))}
              </div>
              {!draft.subjects.length && (
                <p className="empty-small">
                  Your subject list is empty. Start with one course.
                </p>
              )}
            </>
          )}
          {step === 1 && (
            <>
              <div className="editor-list">
                {draft.subjects.map((s) => (
                  <div className="subject-editor tier-editor" key={s.id}>
                    <span
                      className="subject-swatch"
                      style={{ background: s.color }}
                    />
                    <strong>{s.name}</strong>
                    <div
                      className="priority-options"
                      role="group"
                      aria-label={`${s.name} study priority`}
                    >
                      {TIERS.map((t) => (
                        <button
                          key={t}
                          className={`priority-option ${s.tier === t ? "active" : ""}`}
                          aria-pressed={s.tier === t}
                          onClick={() =>
                            update((d) => {
                              d.subjects.find((x) => x.id === s.id).tier = t;
                            })
                          }
                        >
                          <strong>{STUDY_PRIORITIES[t].label}</strong>
                          <small>{STUDY_PRIORITIES[t].description}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="hint-block">
                Choose based on the effort you need this semester, not how good
                you are at a subject. These priorities guide suggested hours;
                your own goals take precedence.
              </p>
            </>
          )}
          {step === 2 && (
            <>
              <div className="hours-metrics">
                <div className="hours-figure">
                  <span>Usable study time</span>
                  <strong>{formatHours(capacity)}h</strong>
                </div>
                <div className="hours-figure">
                  <span>Subject goals</span>
                  <strong>{formatHours(targetSum(draft))}h</strong>
                </div>
              </div>
              <div className="edit-buttons">
                <button
                  onClick={() => {
                    setDraft((current) => suggestForAvailability(current));
                  }}
                >
                  <Sparkles size={16} />
                  Suggest hours by priority
                </button>
                <button
                  className="primary-button"
                  onClick={fill}
                  disabled={filling}
                >
                  <Sparkles size={15} />
                  Fill timetable
                </button>
                <button onClick={() => setStep(-1)}>Change availability</button>
              </div>
              <div className="editor-list">
                {draft.subjects.map((s) => (
                  <label className="subject-editor hours-editor" key={s.id}>
                    <span
                      className="subject-swatch"
                      style={{ background: s.color }}
                    />
                    <strong>
                      {s.name}
                      <small>{priorityLabel(s.tier)}</small>
                    </strong>
                    <input
                      type="number"
                      min="0"
                      max="168"
                      step="0.5"
                      aria-label={`${s.name} weekly hours`}
                      value={draft.targetHours[s.id] ?? 0}
                      onChange={(e) =>
                        update((d) => {
                          d.targetHours[s.id] = Number(e.target.value);
                        })
                      }
                      onBlur={() =>
                        update((d) => {
                          d.targetHours[s.id] = roundHalfHours(
                            d.targetHours[s.id],
                          );
                        })
                      }
                    />
                    <span>h/week · 0.5 steps</span>
                  </label>
                ))}
              </div>
              <p className="hint-block">
                {targetSum(draft) > capacity
                  ? "Your goals exceed available time. If you choose Fill timetable, it will share available hours proportionally and keep your original goals visible."
                  : "Spare time can stay free. You do not need to fill every window or match an exact weekly total."}
              </p>
            </>
          )}
          {step === 3 && (
            <>
              <div className="preset-bar">
                <button
                  className="primary-button"
                  onClick={fill}
                  disabled={filling}
                >
                  <Sparkles size={15} />
                  Fill timetable
                </button>
                <button onClick={() => setStep(-1)}>Change availability</button>
                <span>
                  {formatHours(scheduledHours(draft))}h scheduled ·{" "}
                  {formatHours(capacity)}h available
                </span>
              </div>
              <p className="hint-block">
                Build your own plan with Add time slot below. Nothing is filled
                automatically. Fill timetable is optional: it replaces unlocked
                sessions with suggestions. Edit a course and its times, then
                lock that session to keep it in place. Fill timetable searches
                the remaining space in half-hour increments, prefers sessions of
                2 hours or longer, and never creates a new study stretch under
                90 minutes. Short gaps stay free. Each course stays in one
                continuous stretch per study day. Unlock a session before
                changing it.
              </p>
              {fillNotice && (
                <p className="form-success" role="status">
                  {fillNotice}
                </p>
              )}
              {warnings.length > 0 && (
                <div className="hint-block warning">
                  <ul>
                    {warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
              {DAYS.map((day, di) => {
                const slots = draft.slots
                  .filter((s) => s.day === di)
                  .sort((a, b) => a.start - b.start);
                return (
                  <div className="day-editor" key={day}>
                    <div className="day-editor-title">
                      <strong>{day}</strong>
                      <small>
                        {formatHours(
                          slots.reduce((total, s) => total + duration(s), 0),
                        )}
                        h · {slots.length} blocks
                      </small>
                    </div>
                    {slots.map((slot) => (
                      <div
                        key={slot.id}
                        data-slot-id={slot.id}
                        className={`slot-editor ${slot.protected || slot.fixed ? "protected" : ""}`}
                      >
                        <label>
                          Subject
                          <select
                            aria-label={`${day} ${formatSlotTime(slot.start)} subject`}
                            disabled={!!(slot.protected || slot.fixed)}
                            value={slot.subjectId}
                            onChange={(e) =>
                              changeSlot(slot.id, {
                                subjectId: e.target.value,
                                title: undefined,
                              })
                            }
                          >
                            {draft.subjects.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        {["start", "end"].map((field) => {
                          const parts = timeParts(slot[field]);
                          return (
                            <label key={field}>
                              {field === "start" ? "Starts" : "Ends"}
                              <span className="time-controls">
                                <input
                                  type="time"
                                  aria-label={`${day} ${formatSlotTime(slot.start)} ${field}`}
                                  disabled={!!(slot.protected || slot.fixed)}
                                  value={parts.time}
                                  onChange={(e) =>
                                    changeTime(
                                      slot,
                                      field,
                                      e.target.value,
                                      parts.offset,
                                    )
                                  }
                                />
                                <select
                                  aria-label={`${day} ${field} day offset`}
                                  disabled={!!(slot.protected || slot.fixed)}
                                  value={parts.offset}
                                  onChange={(e) =>
                                    changeTime(
                                      slot,
                                      field,
                                      parts.time,
                                      e.target.value,
                                    )
                                  }
                                >
                                  <option value="0">Today</option>
                                  <option value="1">+1 day</option>
                                </select>
                              </span>
                            </label>
                          );
                        })}
                        <div className="slot-editor-actions">
                          {slot.protected ? (
                            <span className="protected-badge">
                              <LockKeyhole size={13} /> Protected
                            </span>
                          ) : (
                            <>
                              <button
                                className={`secondary-button lock-session ${slot.fixed ? "is-locked" : ""}`}
                                aria-pressed={!!slot.fixed}
                                aria-label={`${slot.fixed ? "Unlock" : "Lock"} ${day} ${formatSlotTime(slot.start)} ${subjectName(draft, slot.subjectId)}`}
                                onClick={() =>
                                  changeSlot(slot.id, { fixed: !slot.fixed })
                                }
                              >
                                {slot.fixed ? (
                                  <Unlock size={14} />
                                ) : (
                                  <LockKeyhole size={14} />
                                )}{" "}
                                {slot.fixed ? "Unlock" : "Lock"}
                              </button>
                              <button
                                title="Remove block"
                                disabled={!!slot.fixed}
                                aria-label={`Remove ${day} ${formatSlotTime(slot.start)} session`}
                                className="icon-button tiny"
                                onClick={() =>
                                  update((d) => {
                                    d.slots = d.slots.filter(
                                      (s) => s.id !== slot.id,
                                    );
                                  })
                                }
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                    <button className="add-slot" onClick={() => addSlot(di)}>
                      <Plus size={15} /> Add time slot
                    </button>
                  </div>
                );
              })}
            </>
          )}
          {step === 4 && (
            <>
              <label className="phase-name-label">
                Phase name
                <input
                  value={draft.name}
                  maxLength={90}
                  onChange={(e) =>
                    update((d) => {
                      d.name = e.target.value;
                    })
                  }
                  placeholder="e.g. Winter exam preparation"
                />
              </label>
              <div className="review-metrics">
                <div>
                  <small>SUBJECT GOALS</small>
                  <strong>{formatHours(targetSum(draft))}h</strong>
                </div>
                <div>
                  <small>SCHEDULED</small>
                  <strong>{formatHours(scheduledHours(draft))}h</strong>
                </div>
                <div>
                  <small>SUBJECTS</small>
                  <strong>{draft.subjects.length}</strong>
                </div>
              </div>
              <div className="review-columns">
                <div>
                  <h4>Hours per subject</h4>
                  {draft.subjects.map((s) => (
                    <div key={s.id} className="review-subject">
                      <span>
                        <i style={{ background: s.color }} />
                        {s.name} · {priorityLabel(s.tier)}
                      </span>
                      <strong>
                        {formatHours(actual[s.id] || 0)}h /{" "}
                        {formatHours(draft.targetHours[s.id])}h
                      </strong>
                    </div>
                  ))}
                </div>
                <div>
                  <h4>Your week</h4>
                  {DAYS.map((day, di) => (
                    <div key={day} className="review-day">
                      <strong>{day}</strong>
                      {draft.slots
                        .filter((s) => s.day === di)
                        .sort((a, b) => a.start - b.start)
                        .map((s) => (
                          <span key={s.id}>
                            {formatSlotTime(s.start)}–{formatSlotTime(s.end)} ·{" "}
                            {s.title || subjectName(draft, s.subjectId)}
                            {s.fixed ? " · Fixed" : ""}
                          </span>
                        ))}
                      {!draft.slots.some((s) => s.day === di) && (
                        <span>Free day</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="edit-buttons">
                <button onClick={() => setStep(2)}>
                  <ChevronLeft size={15} /> Adjust weekly hours
                </button>
                <button onClick={() => setStep(3)}>
                  <ChevronLeft size={15} /> Adjust time slots
                </button>
              </div>
              <div
                className={`hint-block ${issues.length ? "warning" : "good"}`}
              >
                {issues.length ? (
                  <>
                    <AlertTriangle size={16} /> {issues.join(" ")}
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} /> Your timetable has no conflicts.
                    Goals are flexible, and spare time can remain free.
                  </>
                )}
              </div>
              {warnings.length > 0 && (
                <div className="hint-block warning">
                  <div>
                    <strong>Goals and capacity</strong>
                    <ul>
                      {warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                    <p>
                      You can save this plan as it is, then revisit it as the
                      semester changes.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="planner-footer">
          {filling && (
            <span role="status">Searching timetable combinations…</span>
          )}
          <div
            className={`planner-error ${error ? "visible" : ""}`}
            role="alert"
          >
            {error}
          </div>
          <div className="planner-footer-actions">
            <button
              className="secondary-button"
              onClick={() => {
                setStep((s) => Math.max(-1, s - 1));
                setError("");
              }}
              disabled={filling || step === -1}
            >
              <ChevronLeft size={15} /> Back
            </button>
            <button
              className="primary-button"
              onClick={goNext}
              disabled={filling}
            >
              {step === 4 ? (
                "Save phase"
              ) : (
                <>
                  Continue <ChevronRight size={15} />
                </>
              )}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
