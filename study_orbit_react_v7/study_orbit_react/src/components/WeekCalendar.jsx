import CalendarNow from "./CalendarNow.jsx";
import { memo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useClock } from "../hooks/useClock.js";
import {
  DAYS,
  dateKey,
  displayDate,
  formatHours,
  mondayFor,
  parseDate,
  shiftDate,
} from "../lib/time.js";
import { subjectOf, subjectName, scheduledHours } from "../lib/planner.js";
import {
  calendarSegments,
  calendarRange,
  calendarStudyDate,
} from "../lib/weekCalendar.js";

const clock = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Keep the clock overlay in the current week without refreshing the timetable each second. */
function CurrentWeekMarker({ weekStart, start, end }) {
  const now = useClock();
  return dateKey(mondayFor(now)) === weekStart
    ? <CalendarNow start={start} end={end} />
    : null;
}

/** Browse dated occurrences of the recurring plan and open each session's study diary. */
function WeekCalendar({ phase, selectedDate, onSelectDate, onOpenSession }) {
  const selected = parseDate(selectedDate || dateKey(new Date()));
  const monday = mondayFor(selected);
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
  const segments = calendarSegments(phase.slots);
  const { start, end } = calendarRange();
  const hours = Array.from({ length: 25 }, (_, i) => i * 60);
  const weekLabel = `${monday.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} – ${days[6].toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
  return (
    <section
      className="panel section-panel week-calendar"
      aria-labelledby="weekCalendarTitle"
    >
      <div className="section-top">
        <div>
          <span className="panel-overline">THE WHOLE PICTURE</span>
          <h2 id="weekCalendarTitle">Your week at a glance</h2>
        </div>
        <span className="hours-bubble">
          {formatHours(scheduledHours(phase))}h
        </span>
      </div>
      <div className="calendar-week-controls">
        <p className="card-desc">{weekLabel}</p>
        <div className="date-controls">
          <button
            type="button"
            aria-label="Previous calendar week"
            onClick={() => onSelectDate?.(dateKey(shiftDate(selected, -7)))}
          >
            <ChevronLeft size={17} />
          </button>
          <button type="button" onClick={() => onSelectDate?.(dateKey(new Date()))}>
            Today
          </button>
          <button
            type="button"
            aria-label="Next calendar week"
            onClick={() => onSelectDate?.(dateKey(shiftDate(selected, 7)))}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <p className="card-desc">
        {phase.name} · Full 24-hour view. Select a session to log your work,
        edit next steps or review the subject diary. Overnight sessions appear
        on the calendar day they occur.
      </p>
      {!segments.length && (
        <p className="empty-small">
          No sessions yet. Add study time in the phase planner to see your week here.
        </p>
      )}
      <div
        className="week-calendar-scroll"
        tabIndex={0}
        role="region"
        aria-label="Weekly timetable, scroll horizontally"
      >
        <div
          className="week-calendar-grid"
          style={{ "--calendar-height": `${(end - start) * 0.8}px` }}
        >
          <div className="calendar-corner" aria-hidden="true">Time</div>
          {days.map((day, index) => (
            <button
              type="button"
              key={dateKey(day)}
              className={`calendar-day-heading ${dateKey(day) === selectedDate ? "selected" : ""}`}
              aria-label={`Show ${displayDate(day)}`}
              aria-pressed={dateKey(day) === selectedDate}
              onClick={() => onSelectDate?.(dateKey(day))}
            >
              {DAYS[index]}
              <small>{day.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</small>
            </button>
          ))}
          <div
            className="calendar-time-axis"
            aria-hidden="true"
            style={{ gridColumn: 1, gridRow: 2 }}
          >
            {hours.map((time) => (
              <span key={time} style={{ top: `${(time / 1440) * 100}%` }}>
                {clock(time)}
              </span>
            ))}
          </div>
          {days.map((day, index) => (
            <div
              className="calendar-day-column"
              key={dateKey(day)}
              aria-label={displayDate(day)}
              style={{ gridColumn: index + 2, gridRow: 2 }}
            >
              {segments.filter((s) => s.day === index).map((segment) => {
                const { slot } = segment;
                const subject = subjectOf(phase, slot.subjectId);
                const name = slot.title || subjectName(phase, slot.subjectId);
                const label = `${displayDate(day)}, ${clock(segment.start)}–${clock(segment.end)}: ${name}${segment.continued ? " (continued)" : ""}${slot.fixed || slot.protected ? ", locked" : ""}. Open study diary`;
                return (
                  <button
                    type="button"
                    key={`${slot.id}-${segment.start}`}
                    className="calendar-session"
                    aria-label={label}
                    title={label}
                    onClick={() => onOpenSession?.(slot.subjectId, {
                      phaseId: phase.id,
                      date: calendarStudyDate(segment, selected),
                      slotId: slot.id,
                    })}
                    style={{
                      top: `${(segment.start / 1440) * 100}%`,
                      height: `${((segment.end - segment.start) / 1440) * 100}%`,
                      "--subject-color": subject?.color || "#607486",
                    }}
                  >
                    <span>{clock(segment.start)}–{clock(segment.end)}</span>
                    <strong>{name}</strong>
                    {(slot.fixed || slot.protected) && <small>Locked</small>}
                    {segment.continued && <small>Continued</small>}
                  </button>
                );
              })}
              {!segments.some((s) => s.day === index) && <span className="calendar-free">Free day</span>}
            </div>
          ))}
          <CurrentWeekMarker weekStart={dateKey(monday)} start={start} end={end} />
        </div>
      </div>
      <div className="calendar-legend">
        {phase.subjects.filter((subject) => phase.slots.some((slot) => slot.subjectId === subject.id)).map((subject) => (
          <span key={subject.id}>
            <i style={{ background: subject.color }} />{subject.name}
          </span>
        ))}
      </div>
    </section>
  );
}
export default memo(WeekCalendar);
