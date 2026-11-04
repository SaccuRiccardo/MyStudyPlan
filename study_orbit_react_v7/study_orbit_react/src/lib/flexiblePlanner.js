import {
  clone,
  hoursBySubject,
  targetSum,
  validatePhase,
  scheduledHours,
  TIER_WEIGHTS,
  slotsOverlap,
} from "./planner.js";
import { studyWindows, validWindow } from "./availability.js";
import { DAYS, formatHours } from "./time.js";
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
  const actual = hoursBySubject(phase);
  const errors = validatePhase({
    ...phase,
    totalTarget: Math.max(0.5, scheduledHours(phase)),
    targetHours: actual,
  }).filter(
    (error) =>
      !error.startsWith("Subject targets") &&
      !error.startsWith("Weekly hours") &&
      error !== "Add at least one study block.",
  );
  if (
    phase.subjects.some(
      (subject) => !isHalfHourGoal(phase.targetHours[subject.id]),
    )
  )
    errors.push(
      "Use whole or half hours for each subject (for example, 12 or 12.5).",
    );
  if (
    !Array.isArray(phase.availability?.windows) ||
    phase.availability.windows.some((window) => !validWindow(window))
  )
    errors.push("Correct the invalid availability times.");
  if (
    phase.slots
      .filter((slot) => slot.fixed || slot.protected)
      .some((slot) =>
        (phase.availability?.windows || []).some(
          (window) =>
            window.kind === "unavailable" && slotsOverlap(slot, window),
        ),
      )
  )
    errors.push(
      "A fixed session conflicts with unavailable time. Adjust that commitment or the university constraint before saving.",
    );
  const usable = studyWindows(phase.availability?.windows || []);
  for (const slot of phase.slots.filter(
    (slot) => !slot.fixed && !slot.protected,
  )) {
    if (
      !usable.some(
        (window) =>
          window.day === slot.day &&
          window.start <= slot.start &&
          window.end >= slot.end,
      )
    ) {
      errors.push(
        "A flexible session falls outside study availability or inside unavailable time. Refit the timetable or edit availability.",
      );
      break;
    }
  }
  if (
    phase.slots.some(
      (slot) =>
        !slot.fixed && !slot.protected && (slot.end - slot.start) % 30 !== 0,
    )
  )
    errors.push(
      "Study sessions must last whole or half hours. Use Fill timetable to replace older minute-level sessions.",
    );
  for (let day = 0; day < 7; day++)
    for (const subject of phase.subjects) {
      if (
        subjectRuns(phase.slots, day, subject.id).length > 1 &&
        phase.slots.some(
          (slot) =>
            slot.day === day &&
            slot.subjectId === subject.id &&
            !slot.fixed &&
            !slot.protected,
        )
      ) {
        errors.push(
          `${subject.name} has separate sessions on ${DAYS[day]}. Keep one continuous stretch, or use Fill timetable.`,
        );
      }
    }
  return [...new Set(errors)];
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
        `${subject.name}: ${formatHours(placed)}h scheduled / ${formatHours(wanted)}h wanted.`,
      );
  }
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
