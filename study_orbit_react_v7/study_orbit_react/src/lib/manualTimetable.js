import { clone, uid } from "./planner.js";
import { studyWindows } from "./availability.js";

/** Copy free availability as unassigned rows, preserving all subject choices and locks. */
export function copyAvailabilityRows(phase) {
  const next = clone(phase);
  const assigned = next.slots.filter((slot) => slot.subjectId);
  const windows = next.availability?.windows || [];
  const rows = studyWindows(windows, assigned).flatMap((window) => {
    // Keep the boundaries the user entered, even where study windows touch.
    const boundaries = [
      window.start,
      window.end,
      ...windows
        .filter((item) => item.kind === "study" && item.day === window.day)
        .flatMap((item) => [item.start, item.end])
        .filter((time) => time > window.start && time < window.end),
    ];
    const edges = [...new Set(boundaries)].sort((a, b) => a - b);
    return edges
      .slice(0, -1)
      .map((start, index) => ({
        id: uid(),
        day: window.day,
        start,
        end: edges[index + 1],
        subjectId: "",
        fixed: false,
      }));
  });
  next.slots = [...assigned, ...rows].sort(
    (a, b) => a.day - b.day || a.start - b.start,
  );
  return next;
}

/** Empty rows reserve editing space only; they are never saved as study sessions. */
export const assignedTimetable = (phase) => ({
  ...phase,
  slots: phase.slots.filter((slot) => slot.subjectId),
});
