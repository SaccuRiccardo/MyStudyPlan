import { memo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarCheck2,
  Check,
  PencilLine,
  Pin,
} from "lucide-react";
import {
  DAYS,
  blockKey,
  formatSlotTime,
  mondayFor,
  mondayIndex,
  shiftDate,
  dateKey,
  parseDate,
  formatHours,
  duration,
} from "../lib/time.js";
import { subjectOf, subjectName } from "../lib/planner.js";

/** @brief Edit goals and completion for one dated occurrence of a study block. */
function Session({ phase, date, slot, status, progress, onProgress, onEdit }) {
  const subject = subjectOf(phase, slot.subjectId);
  const key = blockKey(phase.id, date, slot.id);
  const info = progress[key] || {};
  const active =
    status.mode === "study" &&
    status.event?.slot.id === slot.id &&
    dateKey(status.event.base) === dateKey(date);
  return (
    <div
      className={`session ${active ? "active" : ""} ${info.done ? "completed" : ""}`}
    >
      <div className="session-time">
        <strong>{formatSlotTime(slot.start)}</strong>
        <small>{formatSlotTime(slot.end)}</small>
      </div>
      <div
        className="subject-color"
        style={{ background: subject?.color || "#718096" }}
      />
      <div className="session-body">
        <div className="session-top">
          <strong>{slot.title || subjectName(phase, slot.subjectId)}</strong>
          {slot.fixed && (
            <span className="fixed-label">
              <Pin size={10} /> LOCKED
            </span>
          )}
        </div>
        <input
          className="session-goal"
          placeholder="Goal for this study block..."
          aria-label={`Goal for ${subject?.name || "subject"}`}
          value={info.goal || ""}
          maxLength={180}
          onChange={(e) => onProgress(key, { goal: e.target.value })}
        />
        <button className="session-next" onClick={() => onEdit(slot.subjectId)}>
          <PencilLine size={12} /> Plan next time
        </button>
      </div>
      <button
        className={`check-button ${info.done ? "is-done" : ""}`}
        title={info.done ? "Mark incomplete" : "Mark completed"}
        aria-label={`Mark ${subject?.name || "block"} ${info.done ? "incomplete" : "complete"}`}
        aria-pressed={!!info.done}
        onClick={() => onProgress(key, { done: !info.done })}
      >
        <Check size={18} />
      </button>
    </div>
  );
}

/** @brief Show chronological blocks and date-specific completion for a selected study day. */
function WeeklySchedule({
  phase,
  selectedDate,
  onSelectDate,
  now,
  status,
  progress,
  onProgress,
  onEdit,
  optionalNote,
  onOptionalNote,
}) {
  const selected = parseDate(selectedDate);
  const monday = mondayFor(selected);
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
  const slots = phase.slots
    .filter((s) => s.day === mondayIndex(selected))
    .sort((a, b) => a.start - b.start);
  const completed = slots.filter(
    (slot) => progress[blockKey(phase.id, selected, slot.id)]?.done,
  );
  return (
    <section className="panel section-panel weekly-schedule">
      <div className="section-top">
        <div>
          <span className="panel-overline">YOUR RHYTHM</span>
          <h2>Weekly schedule</h2>
        </div>
        <div className="date-controls">
          <button
            title="Previous week"
            onClick={() => onSelectDate(dateKey(shiftDate(selected, -7)))}
          >
            <ChevronLeft size={17} />
          </button>
          <button onClick={() => onSelectDate(dateKey(now))}>Today</button>
          <button
            title="Next week"
            onClick={() => onSelectDate(dateKey(shiftDate(selected, 7)))}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div className="day-tabs">
        {days.map((d) => (
          <button
            key={dateKey(d)}
            className={`${dateKey(selected) === dateKey(d) ? "selected" : ""} ${dateKey(now) === dateKey(d) ? "today" : ""}`}
            onClick={() => onSelectDate(dateKey(d))}
          >
            <span>{DAYS[mondayIndex(d)].slice(0, 3)}</span>
            <strong>{d.getDate()}</strong>
          </button>
        ))}
      </div>
      <div className="sessions-head">
        <span>
          {DAYS[mondayIndex(selected)]} ·{" "}
          {formatHours(slots.reduce((s, x) => s + duration(x), 0))}h planned
        </span>
        <span>
          {completed.length}/{slots.length} blocks ·{" "}
          {formatHours(
            completed.reduce((sum, slot) => sum + duration(slot), 0),
          )}
          h marked complete
        </span>
      </div>
      <div className="session-stack">
        {slots.length ? (
          slots.map((slot) => (
            <Session
              key={slot.id}
              phase={phase}
              slot={slot}
              date={selected}
              status={status}
              progress={progress}
              onProgress={onProgress}
              onEdit={onEdit}
            />
          ))
        ) : (
          <div className="empty-state">
            <CalendarCheck2 size={25} />
            <strong>No sessions planned</strong>
            <p>You can take the day off, or add slots in the phase planner.</p>
          </div>
        )}
      </div>
      <div className="optional-box">
        <div className="optional-heading">
          <span>AFTER HOURS</span>
          <small>Completely optional</small>
        </div>
        <textarea
          value={optionalNote || ""}
          placeholder="An optional evening idea or reminder…"
          onChange={(e) => onOptionalNote(e.target.value)}
          rows={2}
        />
      </div>
    </section>
  );
}

export default memo(WeeklySchedule);
