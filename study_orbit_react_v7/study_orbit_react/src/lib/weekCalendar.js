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

export function calendarRange(segments) {
  if (!segments.length) return { start: 540, end: 1080 };
  return {
    start: Math.floor(Math.min(...segments.map((s) => s.start)) / 60) * 60,
    end: Math.ceil(Math.max(...segments.map((s) => s.end)) / 60) * 60,
  };
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
