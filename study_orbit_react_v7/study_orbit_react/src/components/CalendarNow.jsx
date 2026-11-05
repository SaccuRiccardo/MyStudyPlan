import { useClock } from "../hooks/useClock.js";
import { calendarNow } from "../lib/weekCalendar.js";
import { DAYS } from "../lib/time.js";

/** Only the clock overlay refreshes each second; the timetable stays mounted. */
export default function CalendarNow({ start, end }) {
  const now = useClock();
  const marker = calendarNow(now, start, end);
  const label = `Current local time: ${DAYS[marker.day]} ${marker.time}${marker.outside ? `, ${marker.outside.toLowerCase()}` : ""}`;
  return (
    <div
      className="calendar-now-layer"
      style={{ gridColumn: marker.day + 2, gridRow: 2 }}
    >
      <div
        className={`calendar-now-line ${marker.outside ? "outside-hours" : ""} ${marker.outside === "Before shown hours" ? "before-hours" : ""}`}
        style={{ top: `${marker.percent}%` }}
        role="img"
        aria-label={label}
        title={label}
      >
        <span>
          Now {marker.time}
          {marker.outside && <small>{marker.outside}</small>}
        </span>
      </div>
    </div>
  );
}
