import { clone } from "./planner.js";

/** @brief Share subject names while preserving each phase's priority and hours. */
export function saveSubject(state, subject) {
  const index = state.subjects.findIndex((item) => item.id === subject.id);
  if (index < 0) state.subjects.push(clone(subject));
  else state.subjects[index] = clone(subject);
  for (const phase of state.phases) {
    const member = phase.subjects.find((item) => item.id === subject.id);
    if (member)
      Object.assign(member, { name: subject.name, color: subject.color });
  }
}

/** @brief Remove a subject and its phase references without changing unrelated schedules. */
export function deleteSubject(state, subjectId) {
  state.subjects = state.subjects.filter((subject) => subject.id !== subjectId);
  for (const phase of state.phases) {
    const affectedGroups = new Set(
      phase.slots
        .filter((slot) => slot.subjectId === subjectId)
        .map((slot) => slot.group)
        .filter(Boolean),
    );
    for (const slot of phase.slots)
      if (affectedGroups.has(slot.group)) {
        delete slot.autoFillRange;
        delete slot.group;
      }
    phase.subjects = phase.subjects.filter(
      (subject) => subject.id !== subjectId,
    );
    phase.slots = phase.slots.filter((slot) => slot.subjectId !== subjectId);
    delete phase.targetHours[subjectId];
    phase.totalTarget = phase.subjects.reduce(
      (sum, subject) => sum + Number(phase.targetHours[subject.id] || 0),
      0,
    );
  }
  delete state.handoffs[subjectId];
}
