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
    return edges.slice(0, -1).map((start, index) => ({
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
  next.manualAvailabilitySignature = JSON.stringify(windows);
  return next;
}

/** Empty rows reserve editing space only; they are never saved as study sessions. */
export function assignedTimetable(phase) {
  const { manualAvailabilitySignature, ...saved } = phase;
  return { ...saved, slots: phase.slots.filter((slot) => slot.subjectId) };
}

export function syncAvailabilityRows(phase) {
  return phase.manualAvailabilitySignature ===
    JSON.stringify(phase.availability?.windows || [])
    ? phase
    : copyAvailabilityRows(phase);
}

export function splitTimetableRow(phase, slotId) {
  const next = clone(phase),
    slot = next.slots.find((item) => item.id === slotId);
  if (!slot || slot.fixed || slot.protected || slot.end - slot.start < 2)
    return next;
  const end = slot.end,
    minutes = end - slot.start;
  slot.end =
    slot.start +
    (minutes >= 60 ? Math.floor(minutes / 60) * 30 : Math.floor(minutes / 2));
  delete slot.group;
  delete slot.autoFillRange;
  next.slots.push({
    id: uid(),
    day: slot.day,
    start: slot.end,
    end,
    subjectId: "",
    fixed: false,
  });
  return next;
}
