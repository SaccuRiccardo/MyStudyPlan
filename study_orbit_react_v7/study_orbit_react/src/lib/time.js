export const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export const HANDOFF_MINUTES = 10;
export const WEEK_MINUTES = 10080;
/** @brief Pad a clock or calendar component for stable display and date keys. */
export const pad = (value) => String(value).padStart(2, "0");
/** @brief Encode a local calendar date without converting it to UTC. */
export const dateKey = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
/** @brief Read a stored local date without UTC timezone shifts. */
export const parseDate = (key) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
};
/** @brief Move by calendar days while respecting local daylight-saving changes. */
export const shiftDate = (date, offset) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
/** @brief Use Monday-based weekday numbers consistently in all schedules. */
export const mondayIndex = (date) => (date.getDay() + 6) % 7;
/** @brief Find the local Monday for week-specific progress. */
export const mondayFor = (date) => shiftDate(date, -mondayIndex(date));
/** @brief Resolve a study-day minute offset, including the following calendar day. */
export const asDate = (base, minute) =>
  new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, minute);
/** @brief Display times with an explicit next-day marker for overnight slots. */
export const formatSlotTime = (minute) =>
  `${pad(Math.floor((minute % 1440) / 60))}:${pad(minute % 60)}${minute >= 1440 ? " +1d" : ""}`;
/** @brief Display the local clock using an unambiguous 24-hour format. */
export const formatClock = (date) =>
  date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
/** @brief Format a nonnegative live countdown including hours. */
export const formatCount = (milliseconds) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
};
/** @brief Return nominal block hours, independent of handoff or measured study. */
export const duration = (slot) => (slot.end - slot.start) / 60;
/** @brief Display whole/half hours plainly; preserve exact older durations as H:MM instead of long decimals. */
export function formatHours(hours) {
  const minutes = Math.round((Number(hours) || 0) * 60);
  if (minutes % 30 === 0) return String(minutes / 60);
  const absolute = Math.abs(minutes);
  return `${minutes < 0 ? "-" : ""}${Math.floor(absolute / 60)}:${pad(absolute % 60)}`;
}
/** @brief Display the local study date in readable words. */
export const displayDate = (date) =>
  date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** @brief Resolve study, handoff, and next events using local dates and study-day offsets. */
export function getSchedulePosition(phase, now = new Date()) {
  if (!phase) return { mode: "free", event: null, next: null, events: [] };
  const events = [];
  // Include preceding study days: +1d sessions belong to the previous day.
  for (let offset = -9; offset <= 10; offset += 1) {
    const base = shiftDate(now, offset);
    for (const slot of phase.slots.filter((s) => s.day === mondayIndex(base))) {
      events.push({
        slot,
        base,
        start: asDate(base, slot.start),
        end: asDate(base, slot.end),
      });
    }
  }
  events.sort((a, b) => a.start - b.start || a.end - b.end);
  let previous = null;
  for (const event of events) {
    const handoffEnd = previous
      ? previous.end.getTime() + HANDOFF_MINUTES * 60000
      : -Infinity;
    event.actualStart = new Date(Math.max(event.start.getTime(), handoffEnd));
    if (event.actualStart < event.end) previous = event;
  }
  const handoff = events.find(
    (event) =>
      event.actualStart < event.end &&
      now >= event.end &&
      now < new Date(event.end.getTime() + HANDOFF_MINUTES * 60000),
  );
  const study = events.find(
    (event) => now >= event.actualStart && now < event.end,
  );
  const event = handoff || study || null;
  const next =
    events.find(
      (item) => item.actualStart < item.end && item.actualStart > now,
    ) || null;
  return {
    mode: handoff ? "handoff" : study ? "study" : "free",
    event,
    next,
    events,
  };
}

/** @brief Identify completion by phase, study date, and block so weeks stay independent. */
export const blockKey = (phaseId, baseDay, slotId) =>
  `${phaseId}:${dateKey(baseDay)}:${slotId}`;
