import { dateKey, mondayFor, shiftDate } from "./time.js";

/** Split recurring study-day slots into civil calendar days, including Sunday wrap. */
export function calendarSegments(slots) {
  return slots
    .flatMap((slot) => {
      const segments = [];
      for (let cursor = slot.start; cursor < slot.end;) {
        const offset = Math.floor(cursor / 1440);
        const end = Math.min(slot.end, (offset + 1) * 1440);
        segments.push({
          slot,
          day: (slot.day + offset) % 7,
          dayOffset: offset,
          start: cursor % 1440,
          end: end - offset * 1440,
          continued: cursor !== slot.start,
        });
        cursor = end;
      }
      return segments;
    })
    .sort((a, b) => a.day - b.day || a.start - b.start);
}

/** Show 07:00 through 22:00, even when the timetable is empty. */
export function calendarRange() {
  return { start: 420, end: 1320 };
}

/** Resolve a visible segment to its originating study date, including last Sunday's continuation. */
export function calendarStudyDate(segment, weekDate) {
  return dateKey(
    shiftDate(mondayFor(weekDate), segment.day - segment.dayOffset),
  );
}

/** Place the local clock on its civil day; clamp before/after the visible hours explicitly. */
export function calendarNow(now, start, end) {
  const minutes =
    now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  return {
    day: (now.getDay() + 6) % 7,
    percent: Math.max(
      0,
      Math.min(100, ((minutes - start) / (end - start)) * 100),
    ),
    time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    outside:
      minutes < start
        ? "Before shown hours"
        : minutes > end
          ? "After shown hours"
          : null,
  };
}
