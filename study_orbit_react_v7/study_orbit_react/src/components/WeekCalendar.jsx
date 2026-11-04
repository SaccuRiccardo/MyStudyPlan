import { memo } from "react";
import { DAYS, formatHours } from "../lib/time.js";
import { subjectOf, subjectName, scheduledHours } from "../lib/planner.js";
import { calendarSegments, calendarRange } from "../lib/weekCalendar.js";

const clock = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** A recurring phase overview; daily goals and completion remain in the dated list. */
function WeekCalendar({ phase }) {
  const segments = calendarSegments(phase.slots);
  const { start, end } = calendarRange(segments);
  const hours = Array.from(
    { length: (end - start) / 60 + 1 },
    (_, i) => start + i * 60,
  );
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
      <p className="card-desc">
        {phase.name} · recurring weekly plan. Scroll sideways on smaller
        screens. Overnight sessions appear on the calendar day they occur.
      </p>
      {!segments.length ? (
        <p className="empty-small">
          No sessions yet. Add study time in the phase planner to see your week
          here.
        </p>
      ) : (
        <>
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
              <div className="calendar-corner" aria-hidden="true">
                Time
              </div>
              {DAYS.map((day) => (
                <div key={day} className="calendar-day-heading">
                  {day}
                </div>
              ))}
              <div className="calendar-time-axis" aria-hidden="true">
                {hours.map((time) => (
                  <span
                    key={time}
                    style={{
                      top: `${((time - start) / (end - start)) * 100}%`,
                    }}
                  >
                    {clock(time)}
                  </span>
                ))}
              </div>
              {DAYS.map((day, index) => (
                <div className="calendar-day-column" key={day} aria-label={day}>
                  {segments
                    .filter((s) => s.day === index)
                    .map((segment) => {
                      const { slot } = segment,
                        subject = subjectOf(phase, slot.subjectId);
                      const name =
                        slot.title || subjectName(phase, slot.subjectId);
                      const label = `${day}, ${clock(segment.start)}–${clock(segment.end)}: ${name}${segment.continued ? " (continued)" : ""}${slot.fixed || slot.protected ? ", locked" : ""}`;
                      return (
                        <div
                          key={`${slot.id}-${segment.start}`}
                          className="calendar-session"
                          aria-label={label}
                          title={label}
                          style={{
                            top: `${((segment.start - start) / (end - start)) * 100}%`,
                            height: `${((segment.end - segment.start) / (end - start)) * 100}%`,
                            "--subject-color": subject?.color || "#607486",
                          }}
                        >
                          <span>
                            {clock(segment.start)}–{clock(segment.end)}
                          </span>
                          <strong>{name}</strong>
                          {(slot.fixed || slot.protected) && (
                            <small>Locked</small>
                          )}
                          {segment.continued && <small>Continued</small>}
                        </div>
                      );
                    })}
                  {!segments.some((s) => s.day === index) && (
                    <span className="calendar-free">Free day</span>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="calendar-legend">
            {phase.subjects
              .filter((s) =>
                phase.slots.some((slot) => slot.subjectId === s.id),
              )
              .map((s) => (
                <span key={s.id}>
                  <i style={{ background: s.color }} />
                  {s.name}
                </span>
              ))}
          </div>
        </>
      )}
    </section>
  );
}
export default memo(WeekCalendar);
