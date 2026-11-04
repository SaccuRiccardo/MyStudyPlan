import { blockKey, duration, mondayFor, shiftDate } from "./time.js";

/** @brief Count marked hours for one phase and study week, never claiming measured study time. */
export function progressForWeek(phase, blocks, studyDate) {
  const monday = mondayFor(studyDate);
  const bySubject = {};
  let markedHours = 0;
  for (const slot of phase?.slots || []) {
    const key = blockKey(phase.id, shiftDate(monday, slot.day), slot.id);
    if (!blocks[key]?.done) continue;
    const hours = duration(slot);
    markedHours += hours;
    bySubject[slot.subjectId] = (bySubject[slot.subjectId] || 0) + hours;
  }
  return { markedHours, bySubject };
}
