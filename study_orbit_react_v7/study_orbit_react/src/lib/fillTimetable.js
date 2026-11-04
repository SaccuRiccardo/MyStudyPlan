import { studyWindows } from "./availability.js";
import {
  HALF_HOUR_MINUTES,
  halfHourUnits,
  shareHalfHours,
} from "./halfHours.js";

// Keep several alternatives instead of committing to the first subject that fits.
// A bounded search keeps the planner responsive; it does not claim a mathematical optimum.
const SEARCH_WIDTH = 1024;
export const MIN_SESSION_MINUTES = 90;
export const PREFERRED_SESSION_MINUTES = 120;

/** Finish a continuous run, allowing short user locks but never a new tiny session. */
function closeRun(state) {
  if (state.generated && state.runMinutes < MIN_SESSION_MINUTES) return null;
  return {
    ...state,
    shortCount:
      state.shortCount +
      (state.generated && state.runMinutes < PREFERRED_SESSION_MINUTES ? 1 : 0),
    last: -1,
    runMinutes: 0,
    generated: false,
  };
}

/** @brief Group touching sessions into continuous runs for one subject and study day. */
export function subjectRuns(slots, day, subjectId) {
  const runs = [];
  for (const slot of slots
    .filter((item) => item.day === day && item.subjectId === subjectId)
    .sort((a, b) => a.start - b.start)) {
    const previous = runs.at(-1);
    if (previous && slot.start <= previous.end)
      previous.end = Math.max(previous.end, slot.end);
    else runs.push({ start: slot.start, end: slot.end });
  }
  return runs;
}

/** @brief Build half-hour decisions around immutable locks and remove unusable short remainders. */
function timetableEvents(windows, fixed, subjectIndex) {
  const events = fixed.map((slot) => ({
    ...slot,
    kind: "fixed",
    subjectIndex: subjectIndex.get(slot.subjectId),
  }));
  for (const window of studyWindows(windows, fixed)) {
    const units = halfHourUnits(window.end - window.start);
    // Align backwards when a lock follows the window, so a course can continue directly into it.
    const touchesLock = fixed.some(
      (slot) => slot.day === window.day && slot.start === window.end,
    );
    const start = touchesLock
      ? window.end - units * HALF_HOUR_MINUTES
      : window.start;
    for (let index = 0; index < units; index++)
      events.push({
        day: window.day,
        start: start + index * HALF_HOUR_MINUTES,
        end: start + (index + 1) * HALF_HOUR_MINUTES,
        kind: "cell",
        windowEnd: window.end,
      });
  }
  return events.sort(
    (a, b) => a.day - b.day || a.start - b.start || a.end - b.end,
  );
}

/** @brief Fit useful hours, prefer 2h+ runs, then balance goals and reduce switching. */
function better(first, second) {
  return (
    second.filled - first.filled ||
    first.shortCount - second.shortCount ||
    first.penalty - second.penalty ||
    first.runCount - second.runCount
  );
}

/** @brief Keep only the strongest alternative for each future-relevant scheduling state. */
function keepAlternatives(candidates, width) {
  const distinct = new Map();
  for (const state of candidates) {
    const key = `${state.used}:${state.last}:${state.pending}:${state.runMinutes}:${state.generated}:${state.remaining.join(",")}`;
    const existing = distinct.get(key);
    if (!existing || better(state, existing) < 0) distinct.set(key, state);
  }
  const alternatives = [...distinct.values()];
  const coherent = (a, b) =>
    b.filled - a.filled || a.runCount - b.runCount || a.penalty - b.penalty;
  // Retain both long-session plans and fair-share plans, rather than scattering every course into every day.
  const compact = alternatives.sort(coherent).slice(0, Math.ceil(width / 2));
  const selected = new Set(compact);
  const balanced = alternatives
    .sort(better)
    .filter((state) => !selected.has(state))
    .slice(0, width - compact.length);
  return [...compact, ...balanced];
}

/** @brief Read the chosen half-hour assignments back as ordinary, contiguous study sessions. */
function scheduledSlots(state, subjects, oldSlots) {
  const cells = [];
  for (let node = state.history; node; node = node.previous) cells.push(node);
  const sessions = [];
  for (const cell of cells.reverse()) {
    const subjectId = subjects[cell.subjectIndex].id;
    const previous = sessions.at(-1);
    if (
      previous &&
      previous.day === cell.day &&
      previous.subjectId === subjectId &&
      previous.end === cell.start &&
      cell.end - previous.start <= 720
    )
      previous.end = cell.end;
    else
      sessions.push({
        day: cell.day,
        start: cell.start,
        end: cell.end,
        subjectId,
        fixed: false,
      });
  }
  const usedIds = new Set(
    oldSlots
      .filter((slot) => slot.fixed || slot.protected)
      .map((slot) => slot.id),
  );
  return sessions.map((slot) => {
    const previous = oldSlots.find(
      (old) =>
        !old.fixed &&
        !old.protected &&
        old.day === slot.day &&
        old.start === slot.start &&
        old.end === slot.end &&
        old.subjectId === slot.subjectId,
    );
    let id =
      previous?.id ||
      `plan-${slot.day}-${slot.start}-${slot.end}-${slot.subjectId}`;
    while (usedIds.has(id)) id += "-copy";
    usedIds.add(id);
    return { ...slot, id };
  });
}

/** @brief Search combinations of half-hour sessions without moving locks or repeating a course in separate daily runs. */
export function fillTimetable(phase, requestedUnits) {
  const fixed = phase.slots.filter((slot) => slot.fixed || slot.protected);
  const subjects = phase.subjects.filter(
    (subject) =>
      requestedUnits[subject.id] > 0 ||
      fixed.some((slot) => slot.subjectId === subject.id),
  );
  const subjectIndex = new Map(
    subjects.map((subject, index) => [subject.id, index]),
  );
  const events = timetableEvents(
    phase.availability?.windows || [],
    fixed,
    subjectIndex,
  );
  const capacity = events.filter((event) => event.kind === "cell").length;
  const requests = subjects.map((subject) => requestedUnits[subject.id] || 0);
  const wanted = requests.reduce((sum, units) => sum + units, 0);
  const ideal =
    wanted > capacity
      ? shareHalfHours(
          Object.fromEntries(
            subjects.map((subject, index) => [subject.id, requests[index]]),
          ),
          capacity,
        )
      : requestedUnits;
  const goals = subjects.map((subject) => ideal[subject.id] || 0);
  const locks = Array.from({ length: 7 }, (_, day) =>
    subjects.map((subject) => subjectRuns(fixed, day, subject.id)),
  );
  // A BigInt mask remembers used courses without the 32-course limit of ordinary bitwise numbers.
  const bits = subjects.map((_, index) => 1n << BigInt(index));
  const width =
    subjects.length > 12
      ? Math.max(16, Math.floor(1536 / subjects.length))
      : SEARCH_WIDTH;
  let states = [
    {
      remaining: requests,
      filled: 0,
      penalty: goals.reduce((sum, goal) => sum + (goal * goal) / (goal + 1), 0),
      used: 0n,
      last: -1,
      pending: -1,
      runMinutes: 0,
      generated: false,
      shortCount: 0,
      runCount: 0,
      history: null,
    },
  ];
  let previous = null;
  for (const [eventIndex, event] of events.entries()) {
    const candidates = [];
    for (const old of states) {
      let state = { ...old };
      if (
        !previous ||
        previous.day !== event.day ||
        previous.end !== event.start
      ) {
        state = closeRun(state);
        if (!state || state.pending >= 0) continue;
      }
      if (!previous || previous.day !== event.day) {
        state.used = 0n;
      }
      if (event.kind === "fixed") {
        const index = event.subjectIndex;
        if (state.last !== index) {
          state = closeRun(state);
          if (!state) continue;
        }
        if (index === undefined) {
          candidates.push({ ...state, last: -1, pending: -1 });
          continue;
        }
        // Existing disjoint locks are preserved as explicit user exceptions; never add a third run.
        const repeatedLocks = locks[event.day][index].length > 1;
        if (
          !repeatedLocks &&
          (state.used & bits[index]) !== 0n &&
          state.last !== index
        )
          continue;
        if (state.pending >= 0 && state.pending !== index) continue;
        candidates.push({
          ...state,
          used: state.used | bits[index],
          last: index,
          pending: -1,
          runMinutes: Math.min(
            PREFERRED_SESSION_MINUTES,
            state.runMinutes + event.end - event.start,
          ),
        });
        continue;
      }
      const closed = closeRun(state);
      if (state.pending < 0 && closed) candidates.push(closed); // Short gaps stay free.
      for (let index = 0; index < subjects.length; index++) {
        if (
          state.remaining[index] <= 0 ||
          (state.pending >= 0 && state.pending !== index)
        )
          continue;
        if ((state.used & bits[index]) !== 0n && state.last !== index) continue;
        const base = state.last === index ? state : closed;
        if (!base) continue;
        const runs = locks[event.day][index];
        if (runs.length > 1) continue;
        let pending = state.pending;
        if (runs.length === 1 && event.end <= runs[0].start) {
          const distance = runs[0].start - event.start;
          if (
            event.windowEnd !== runs[0].start ||
            distance % HALF_HOUR_MINUTES !== 0 ||
            state.remaining[index] < distance / HALF_HOUR_MINUTES
          )
            continue;
          pending = index; // Starting before this lock commits us to extending all the way to it.
        }
        const remaining = [...base.remaining];
        remaining[index]--;
        const runMinutes = Math.min(
          PREFERRED_SESSION_MINUTES,
          base.runMinutes + HALF_HOUR_MINUTES,
        );
        // Reject dead ends before pruning: this run must be able to reach 90 minutes,
        // including a touching user lock, without exceeding the subject's goal.
        let possible = runMinutes,
          budget = remaining[index],
          end = event.end;
        for (
          let nextIndex = eventIndex + 1;
          possible < MIN_SESSION_MINUTES && nextIndex < events.length;
          nextIndex++
        ) {
          const next = events[nextIndex];
          if (next.day !== event.day || next.start !== end) break;
          if (next.kind === "fixed") {
            if (next.subjectIndex !== index) break;
            possible += next.end - next.start;
          } else {
            if (budget-- <= 0) break;
            possible += HALF_HOUR_MINUTES;
          }
          end = next.end;
        }
        if (possible < MIN_SESSION_MINUTES) continue;
        const placed = requests[index] - base.remaining[index];
        const penalty =
          base.penalty +
          ((placed + 1 - goals[index]) ** 2 - (placed - goals[index]) ** 2) /
            (goals[index] + 1);
        candidates.push({
          ...base,
          remaining,
          filled: base.filled + 1,
          penalty,
          used: state.used | bits[index],
          last: index,
          pending,
          runMinutes,
          generated: true,
          runCount: state.runCount + (state.last !== index ? 1 : 0),
          history: {
            day: event.day,
            start: event.start,
            end: event.end,
            subjectIndex: index,
            previous: state.history,
          },
        });
      }
    }
    states = keepAlternatives(candidates, width);
    previous = event;
  }
  const best = states
    .map(closeRun)
    .filter((state) => state && state.pending < 0)
    .sort(better)[0];
  return [
    ...fixed,
    ...(best ? scheduledSlots(best, subjects, phase.slots) : []),
  ].sort((a, b) => a.day - b.day || a.start - b.start);
}
