import {
  clone,
  hoursBySubject,
  targetSum,
  TIERS,
  scheduledHours,
  TIER_WEIGHTS,
  slotsOverlap,
} from "./planner.js";
import { studyWindows, validWindow } from "./availability.js";
import { DAYS, formatHours, formatSlotTime } from "./time.js";
import {
  halfHourUnits,
  roundHalfHours,
  shareHalfHours,
  isHalfHourGoal,
} from "./halfHours.js";
import {
  fillTimetable,
  subjectRuns,
  MIN_SESSION_MINUTES,
} from "./fillTimetable.js";

/** @brief Give the phase an independent availability copy; a saved preset is never a live link. */
export function useAvailability(phase, preset) {
  const next = clone(phase);
  next.planningMode = "flexible";
  next.availability = {
    name: preset.name,
    notes: preset.notes || "",
    windows: clone(preset.windows),
  };
  next.presetId = preset.id || null;
  return next;
}

/** @brief Suggest whole/half-hour needs by rank after reserving locked commitments. */
export function suggestForAvailability(phase) {
  const fixed = phase.slots.filter((slot) => slot.fixed || slot.protected);
  const usable = studyWindows(phase.availability?.windows || [], fixed);
  const units = usable.reduce(
    (sum, window) => sum + halfHourUnits(window.end - window.start),
    0,
  );
  const fixedHours = hoursBySubject({ ...phase, slots: fixed });
  const weights = Object.fromEntries(
    phase.subjects.map((subject) => [
      subject.id,
      TIER_WEIGHTS[subject.tier] || 1,
    ]),
  );
  const shared = shareHalfHours(weights, units);
  const targetHours = Object.fromEntries(
    phase.subjects.map((subject) => [
      subject.id,
      (Math.ceil((fixedHours[subject.id] || 0) * 2) +
        (shared[subject.id] || 0)) /
        2,
    ]),
  );
  return {
    ...phase,
    targetHours,
    totalTarget: Object.values(targetHours).reduce(
      (sum, hours) => sum + hours,
      0,
    ),
  };
}

/** @brief Fill whole/half-hour sessions using several combinations, preserving locks and original goals. */
export function adaptToAvailability(phase) {
  const next = clone(phase);
  // Older exports may contain minute-level recommendations; convert those goals only when refilling.
  next.targetHours = Object.fromEntries(
    next.subjects.map((subject) => [
      subject.id,
      roundHalfHours(next.targetHours[subject.id] || 0),
    ]),
  );
  const fixed = next.slots.filter((slot) => slot.fixed || slot.protected);
  const fixedHours = hoursBySubject({ ...next, slots: fixed });
  const requested = Object.fromEntries(
    next.subjects.map((subject) => [
      subject.id,
      halfHourUnits(
        (next.targetHours[subject.id] - (fixedHours[subject.id] || 0)) * 60,
      ),
    ]),
  );
  next.slots = fillTimetable(next, requested);
  return next;
}

/** @brief Validate real timetable errors while treating requested hours as flexible goals. */
export function flexibleErrors(phase) {
  const errors = [];
  if (!phase.name?.trim())
    errors.push("Enter a phase name in Review before saving.");
  if (!phase.subjects.length)
    errors.push(
      "Add at least one subject in Subjects, then choose it for your timetable sessions.",
    );
  for (const subject of phase.subjects) {
    if (!subject.name?.trim())
      errors.push("A subject has no name. Open Subjects and enter its name.");
    if (!TIERS.includes(subject.tier))
      errors.push(`${subject.name}: choose an effort priority in Priorities.`);
    if (!isHalfHourGoal(phase.targetHours[subject.id]))
      errors.push(
        `${subject.name}: enter a nonnegative weekly goal in whole or half hours, such as 2, 2.5 or 3. This is a goal, not a required timetable total.`,
      );
  }
  const windows = phase.availability?.windows;
  if (!Array.isArray(windows))
    errors.push(
      "Open Availability and add study periods before building the timetable.",
    );
  else
    for (const [index, window] of windows.entries())
      if (!validWindow(window))
        errors.push(
          `${DAYS[window?.day] || "Availability"}, period ${index + 1}: enter a valid start and later end, at most 12 hours apart. For a period crossing midnight, choose +1 day for the end.`,
        );
  const valid = [];
  for (const slot of phase.slots) {
    const label = sessionLabel(phase, slot);
    if (
      !Number.isInteger(slot.day) ||
      slot.day < 0 ||
      slot.day > 6 ||
      !Number.isFinite(slot.start) ||
      !Number.isFinite(slot.end) ||
      slot.start < 0 ||
      slot.end > 2880 ||
      slot.end <= slot.start ||
      slot.end - slot.start > 720
    ) {
      errors.push(
        `${label}: correct the start/end times. The end must be later than the start, and one session can last at most 12 hours. For overnight study choose +1 day for the end; split longer sessions.`,
      );
      continue;
    }
    valid.push(slot);
    if (!phase.subjects.some((subject) => subject.id === slot.subjectId))
      errors.push(
        `${label}: choose a subject from the Subject menu, or remove this row to leave the time free.`,
      );
    for (const blocked of (windows || []).filter(
      (window) => window.kind === "unavailable" && validWindow(window),
    )) {
      if (slotsOverlap(slot, blocked))
        errors.push(
          `${label}: ${slot.fixed || slot.protected ? "This fixed session conflicts" : "This session conflicts"} with unavailable time on ${DAYS[blocked.day]} ${formatSlotTime(blocked.start)}–${formatSlotTime(blocked.end)}. ${slot.protected ? "Move the unavailable period or remove the protected commitment through its subject." : "Unlock it if locked, then move or shorten the session; or correct that blocked period in Availability."}`,
        );
    }
  }
  for (let i = 0; i < valid.length; i++)
    for (let j = i + 1; j < valid.length; j++)
      if (slotsOverlap(valid[i], valid[j]))
        errors.push(
          `${sessionLabel(phase, valid[i])} overlaps ${sessionLabel(phase, valid[j])}. Move, shorten, split or remove one of these sessions in Timetable. Unlock it first if needed.`,
        );
  if (new Set(phase.slots.map((slot) => slot.id)).size !== phase.slots.length)
    errors.push(
      "Two timetable rows share the same identifier. Remove one of the duplicated rows and add it again.",
    );
  if (
    new Set(phase.subjects.map((subject) => subject.id)).size !==
    phase.subjects.length
  )
    errors.push(
      "A subject is duplicated in this phase. Remove the duplicate in Subjects.",
    );
  return [...new Set(errors)];
}

function sessionLabel(phase, slot) {
  const name =
    phase.subjects.find((subject) => subject.id === slot.subjectId)?.name ||
    "Unassigned session";
  const time =
    Number.isFinite(slot.start) && Number.isFinite(slot.end)
      ? `${formatSlotTime(slot.start)}–${formatSlotTime(slot.end)}`
      : "missing time";
  return `${DAYS[slot.day] || "Unknown day"} ${time} (${name})`;
}

/** @brief Describe unmet needs honestly without preventing a useful partial semester plan. */
export function planningWarnings(phase) {
  const warnings = [];
  const actual = hoursBySubject(phase);
  for (const subject of phase.subjects) {
    const wanted = Number(phase.targetHours[subject.id] || 0),
      placed = actual[subject.id] || 0;
    if (Math.abs(wanted - placed) > 1 / 120)
      warnings.push(
        `${subject.name}: ${formatHours(placed)}h scheduled / ${formatHours(wanted)}h goal (${formatHours(Math.abs(wanted - placed))}h ${placed < wanted ? "below" : "above"} goal). You can save this timetable exactly as entered; matching the goal is optional.`,
      );
  }
  const usable = studyWindows(phase.availability?.windows || []);
  for (const slot of phase.slots)
    if (
      !usable.some(
        (window) =>
          window.day === slot.day &&
          window.start <= slot.start &&
          window.end >= slot.end,
      )
    )
      warnings.push(
        `${sessionLabel(phase, slot)} is outside the initial study availability. You can keep and save this extra time, or adjust the session or availability to match.`,
      );
  for (let day = 0; day < 7; day++)
    for (const subject of phase.subjects)
      if (subjectRuns(phase.slots, day, subject.id).length > 1)
        warnings.push(
          `${subject.name} has separate sessions on ${DAYS[day]}. Your manual sessions can be saved; a continuous stretch is only a recommendation used by autofill.`,
        );
  const fixed = phase.slots.filter((slot) => slot.fixed || slot.protected);
  const capacity =
    fixed.reduce((sum, slot) => sum + (slot.end - slot.start) / 60, 0) +
    studyWindows(phase.availability?.windows || [], fixed).reduce(
      (sum, window) => sum + halfHourUnits(window.end - window.start) / 2,
      0,
    );
  if (targetSum(phase) > capacity)
    warnings.push(
      "Your needs exceed available time. Reduce some goals, add availability, or keep this partial plan.",
    );
  for (let day = 0; day < 7; day++)
    for (const subject of phase.subjects) {
      if (subjectRuns(fixed, day, subject.id).length > 1)
        warnings.push(
          `${subject.name} has separate locked sessions on ${DAYS[day]}. Fill keeps your locks; unlock or move one to get a single continuous stretch.`,
        );
    }
  const freeMinutes = studyWindows(
    phase.availability?.windows || [],
    phase.slots,
  ).reduce((sum, window) => sum + window.end - window.start, 0);
  if (freeMinutes > 0 && targetSum(phase) > scheduledHours(phase) + 1 / 120)
    warnings.push(
      "Some preset time is free. Fill prefers 2h+ sessions, requires at least 90 minutes per new study stretch, and keeps a continuous daily stretch per course and your locked choices. It leaves short gaps free rather than fragmenting your study.",
    );
  if (
    phase.subjects.some((subject) => {
      const goal = Number(phase.targetHours[subject.id] || 0);
      return goal > 0 && goal * 60 < MIN_SESSION_MINUTES;
    })
  )
    warnings.push(
      "A weekly goal below 1.5h cannot create a new study session. Increase it to at least 1.5h, or leave that time free. Existing locks can still be extended.",
    );
  if (
    phase.subjects.some((subject) =>
      DAYS.some((_, day) =>
        subjectRuns(phase.slots, day, subject.id).some(
          (run) => run.end - run.start < MIN_SESSION_MINUTES,
        ),
      ),
    )
  )
    warnings.push(
      "Some existing sessions are shorter than 90 minutes. Fill replaces unlocked sessions with longer study stretches; locked sessions keep your exact choices.",
    );
  if (fixed.some((slot) => (slot.end - slot.start) % 30 !== 0))
    warnings.push(
      "An older locked session has a minute-level duration. Fill keeps its exact times; unlock and adjust it if you want only whole/half hours.",
    );
  if (!phase.slots.length)
    warnings.push(
      "No sessions are scheduled yet. You can save this phase and return when your university timetable is known.",
    );
  return warnings;
}
