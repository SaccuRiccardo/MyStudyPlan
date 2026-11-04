import { DAYS, WEEK_MINUTES, duration, formatHours } from "./time.js";

export const SUBJECT_COLORS = [
  "#6559c3",
  "#2674ad",
  "#148b72",
  "#ad702a",
  "#9c599c",
  "#4e778a",
  "#c76b63",
  "#608c41",
];
export const TIERS = ["SS", "S", "A", "B"];
export const TIER_WEIGHTS = { SS: 4, S: 3, A: 2, B: 1 };
// Keep stored keys compatible with existing plans and imports; show useful workload labels.
export const STUDY_PRIORITIES = {
  SS: {
    label: "Intensive",
    description: "Top priority · needs the most study time",
  },
  S: {
    label: "High effort",
    description: "High priority · build understanding and practise",
  },
  A: {
    label: "Steady",
    description: "Regular priority · keep making progress",
  },
  B: {
    label: "Maintenance",
    description: "Lower priority · review and stay familiar",
  },
};
export const priorityLabel = (tier) =>
  STUDY_PRIORITIES[tier]?.label || "Maintenance";
/** @brief Reserve study capacity under its own identity, without crediting a named course. */
export const flexibleStudySubject = () => ({
  id: uid(),
  name: "Flexible study",
  kind: "flexible",
  tier: "A",
  color: "#4e778a",
});
/** @brief Copy nested state so editing a draft cannot mutate another phase. */
export const clone = (value) => structuredClone(value);
/** @brief Create independent identifiers for new subjects, phases, and blocks. */
export const uid = () =>
  globalThis.crypto?.randomUUID?.() ||
  `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
/** @brief Start a blank independent draft without creating personal data. */
export const freshPhase = () => ({
  id: uid(),
  name: "",
  subjects: [],
  targetHours: {},
  totalTarget: 42,
  template: "classic",
  slots: [],
});
/** @brief Find a phase member by stable subject identity. */
export const subjectOf = (phase, id) =>
  phase?.subjects.find((subject) => subject.id === id);
/** @brief Provide a readable fallback for unassigned blocks. */
export const subjectName = (phase, id) =>
  subjectOf(phase, id)?.name || "Unassigned";
/** @brief Sum nominal timetable hours; this does not measure actual study. */
export const scheduledHours = (phase) =>
  phase.slots.reduce((sum, slot) => sum + duration(slot), 0);
/** @brief Sum user-requested subject hours for feasibility checks. */
export const targetSum = (phase) =>
  phase.subjects.reduce(
    (sum, subject) => sum + (Number(phase.targetHours?.[subject.id]) || 0),
    0,
  );
/** @brief Group nominal scheduled hours by subject for allocation feedback. */
export function hoursBySubject(phase) {
  const hours = Object.fromEntries(
    phase.subjects.map((subject) => [subject.id, 0]),
  );
  for (const slot of phase.slots)
    hours[slot.subjectId] = (hours[slot.subjectId] || 0) + duration(slot);
  return hours;
}

/** @brief Suggest tier-weighted hours after reserving mandatory commitments. */
export function suggestHours(phase) {
  if (!phase.subjects.length) return phase;
  const next = clone(phase);
  const fixedHours = hoursBySubject({
    ...next,
    slots: next.slots.filter((slot) => slot.fixed || slot.protected),
  });
  const minimum = Object.fromEntries(
    next.subjects.map((subject) => [subject.id, fixedHours[subject.id] || 0]),
  );
  const fixedTotal = Object.values(minimum).reduce(
    (sum, hours) => sum + hours,
    0,
  );
  const units = Math.max(
    0,
    Math.round((Number(next.totalTarget || 0) - fixedTotal) * 2),
  );
  const weightSum = next.subjects.reduce((n, s) => n + TIER_WEIGHTS[s.tier], 0);
  const portions = next.subjects.map((subject) => {
    const raw = (units * TIER_WEIGHTS[subject.tier]) / weightSum;
    return { subject, whole: Math.floor(raw), remainder: raw % 1 };
  });
  let left = units - portions.reduce((n, portion) => n + portion.whole, 0);
  portions.sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; left > 0; i++, left--) portions[i % portions.length].whole++;
  next.targetHours = Object.fromEntries(
    portions.map(({ subject, whole }) => [
      subject.id,
      minimum[subject.id] + whole / 2,
    ]),
  );
  return next;
}

/** @brief Assign requested minutes to available slots while preserving fixed commitments. */
export function autoFill(phase) {
  const next = clone(phase);
  const remaining = Object.fromEntries(
    next.subjects.map((s) => [
      s.id,
      Math.round(Number(next.targetHours[s.id] || 0) * 60),
    ]),
  );
  const fixed = next.slots.filter((s) => s.fixed || s.protected);
  for (const slot of fixed)
    remaining[slot.subjectId] =
      (remaining[slot.subjectId] || 0) - (slot.end - slot.start);
  const flexible = next.slots
    .filter((s) => !s.fixed && !s.protected)
    .sort((a, b) => a.day - b.day || a.start - b.start);
  const filled = [];
  let lastSubject = null;
  // Rejoin pieces from earlier auto-fill operations so a repeated auto-fill is reversible.
  const merged = [];
  for (const slot of flexible) {
    const previous = merged.at(-1);
    if (
      previous &&
      slot.group &&
      previous.group === slot.group &&
      slot.day === previous.day &&
      slot.start <= previous.end
    )
      previous.end = Math.max(
        previous.end,
        slot.autoFillRange?.end ?? slot.end,
      );
    else
      merged.push({
        ...slot,
        start: slot.autoFillRange?.start ?? slot.start,
        end: slot.autoFillRange?.end ?? slot.end,
      });
  }
  for (const base of merged) {
    let cursor = base.start;
    while (cursor < base.end) {
      const capacity = base.end - cursor;
      const options = next.subjects
        .filter((s) => remaining[s.id] > 0)
        .sort((a, b) => {
          const score = (s) =>
            (remaining[s.id] >= capacity ? 10000 : 0) +
            remaining[s.id] +
            TIER_WEIGHTS[s.tier] * 7 -
            (s.id === lastSubject ? 60 : 0);
          return score(b) - score(a);
        });
      if (!options.length) break;
      const chosen = options[0];
      const minutes = Math.min(capacity, remaining[chosen.id]);
      filled.push({
        id: cursor === base.start ? base.id : uid(),
        day: base.day,
        start: cursor,
        end: cursor + minutes,
        subjectId: chosen.id,
        fixed: false,
        group: base.group || base.id,
        autoFillRange: { start: base.start, end: base.end },
      });
      remaining[chosen.id] -= minutes;
      lastSubject = chosen.id;
      cursor += minutes;
    }
  }
  next.slots = [...fixed, ...filled].sort(
    (a, b) => a.day - b.day || a.start - b.start,
  );
  return next;
}

/** @brief Forget generated capacity for an edited group so auto-fill respects manual changes. */
export function forgetAutoFillGroup(phase, slotId) {
  const selected = phase.slots.find((slot) => slot.id === slotId);
  if (!selected) return;
  for (const slot of phase.slots) {
    if (
      slot.id === slotId ||
      (selected.group && slot.group === selected.group)
    ) {
      delete slot.autoFillRange;
      // Keep the group comparison stable until all members have been visited.
    }
  }
  const group = selected.group;
  for (const slot of phase.slots)
    if (slot.id === slotId || (group && slot.group === group))
      delete slot.group;
}

/** @brief Create an optional weekly starting schedule while retaining protected blocks. */
export function applyPreset(phase, preset) {
  const next = clone(phase);
  const protectedSlots = next.slots.filter((slot) => slot.protected);
  const periods =
    preset === "night"
      ? [
          [660, 840],
          [1140, 1260],
          [1500, 1620],
        ]
      : preset === "blank"
        ? []
        : [
            [540, 720],
            [840, 960],
            [960, 1080],
          ];
  const days = preset === "weekdays" ? 6 : 7;
  let slots = [];
  for (let day = 0; day < days; day++) {
    slots.push(
      ...periods.map(([start, end]) => ({
        id: uid(),
        day,
        start,
        end,
        subjectId: next.subjects[0]?.id || "",
        fixed: false,
      })),
    );
  }
  // Protect existing mandatory blocks; remove conflicting flexible slots before auto-filling.
  slots = slots.filter(
    (slot) => !protectedSlots.some((fixed) => slotsOverlap(fixed, slot)),
  );
  next.template = preset;
  next.slots = [...slots, ...protectedSlots];
  return autoFill(next);
}

/** @brief Explain invalid targets, missing subjects, time conflicts, and infeasible allocations. */
export function validatePhase(phase) {
  const errors = [];
  if (!phase.name?.trim()) errors.push("Name your phase.");
  if (!phase.subjects.length) errors.push("Add at least one subject.");
  if (phase.subjects.some((s) => !s.name?.trim()))
    errors.push("Every subject needs a name.");
  if (
    !Number.isFinite(Number(phase.totalTarget)) ||
    phase.totalTarget < 0.5 ||
    phase.totalTarget > 168
  )
    errors.push("Weekly hours must be between 0.5 and 168.");
  if (Math.abs(targetSum(phase) - phase.totalTarget) > 0.01)
    errors.push(
      `Subject targets sum to ${formatHours(targetSum(phase))}h instead of ${formatHours(phase.totalTarget)}h.`,
    );
  const actual = hoursBySubject(phase);
  for (const s of phase.subjects) {
    if (
      Math.abs((actual[s.id] || 0) - Number(phase.targetHours[s.id] || 0)) >
      0.01
    )
      errors.push(
        `${s.name}: ${formatHours(actual[s.id])}h scheduled, ${formatHours(phase.targetHours[s.id])}h requested.`,
      );
  }
  if (!phase.slots.length) errors.push("Add at least one study block.");
  if (phase.slots.some((s) => !subjectOf(phase, s.subjectId)))
    errors.push("Every block needs a subject.");
  if (
    phase.slots.some(
      (s) =>
        !Number.isInteger(s.day) ||
        s.day < 0 ||
        s.day > 6 ||
        !Number.isFinite(s.start) ||
        !Number.isFinite(s.end) ||
        s.start < 0 ||
        s.end > 2880 ||
        s.end <= s.start ||
        s.end - s.start > 720,
    )
  )
    errors.push("Invalid time block (maximum 12h; end must follow start).");
  if (new Set(phase.subjects.map((s) => s.id)).size !== phase.subjects.length)
    errors.push("Subject IDs must be unique.");
  if (new Set(phase.slots.map((s) => s.id)).size !== phase.slots.length)
    errors.push("Block IDs must be unique within a phase.");
  if (phase.subjects.some((s) => !TIERS.includes(s.tier)))
    errors.push("Choose a valid priority tier.");
  if (
    phase.subjects.some(
      (s) =>
        !Number.isFinite(Number(phase.targetHours[s.id])) ||
        Number(phase.targetHours[s.id]) < 0,
    )
  )
    errors.push("Subject hours must be finite and nonnegative.");
  if (
    phase.slots.some((slot, i) =>
      phase.slots.slice(i + 1).some((other) => slotsOverlap(slot, other)),
    )
  )
    errors.push(
      "Two blocks overlap, including across midnight or the weekly boundary.",
    );
  return [...new Set(errors)];
}

/** @brief Compare recurring intervals, including overnight and weekly boundaries. */
export function slotsOverlap(first, second) {
  const start = first.day * 1440 + first.start;
  const end = first.day * 1440 + first.end;
  return [-WEEK_MINUTES, 0, WEEK_MINUTES].some(
    (offset) =>
      start < second.day * 1440 + second.end + offset &&
      second.day * 1440 + second.start + offset < end,
  );
}

/** @brief Upgrade compatible stored state and repair legacy identifiers without sharing mutable data. */
export function normalizeState(input) {
  const data =
    input && typeof input === "object" && !Array.isArray(input)
      ? clone(input)
      : {};
  // v6 exported JSON is intentionally compatible.
  data.version = 7;
  data.theme = ["light", "dark"].includes(data.theme) ? data.theme : "light";
  data.phases = Array.isArray(data.phases)
    ? data.phases
        .filter(
          (p) =>
            p &&
            typeof p.id === "string" &&
            typeof p.name === "string" &&
            Array.isArray(p.slots) &&
            Array.isArray(p.subjects),
        )
        .map((p) => ({
          ...p,
          subjects: p.subjects
            .filter(
              (s) =>
                s && typeof s.id === "string" && typeof s.name === "string",
            )
            .map((s, i) => ({
              ...s,
              tier: TIER_WEIGHTS[s.tier] ? s.tier : "B",
              color: /^#[0-9a-f]{6}$/i.test(s.color || "")
                ? s.color
                : SUBJECT_COLORS[i % SUBJECT_COLORS.length],
            })),
          slots: p.slots.filter(
            (s) =>
              s &&
              typeof s.id === "string" &&
              typeof s.subjectId === "string" &&
              Number.isInteger(s.day) &&
              s.day >= 0 &&
              s.day < 7 &&
              Number.isFinite(s.start) &&
              Number.isFinite(s.end),
          ),
          targetHours:
            p.targetHours &&
            typeof p.targetHours === "object" &&
            !Array.isArray(p.targetHours)
              ? p.targetHours
              : hoursBySubject(p),
        }))
    : [];
  data.blocks =
    data.blocks &&
    typeof data.blocks === "object" &&
    !Array.isArray(data.blocks)
      ? data.blocks
      : {};
  for (const phase of data.phases) {
    const counts = new Map();
    for (const slot of phase.slots)
      counts.set(slot.id, (counts.get(slot.id) || 0) + 1);
    const used = new Set(
      phase.slots
        .filter((slot) => counts.get(slot.id) === 1)
        .map((slot) => slot.id),
    );
    for (const slot of phase.slots) {
      if (counts.get(slot.id) === 1) continue;
      const oldId = slot.id;
      let newId = `${slot.day}-${oldId}`;
      while (used.has(newId)) newId += "-copy";
      slot.id = newId;
      used.add(newId);
      for (const [key, value] of Object.entries(data.blocks)) {
        const prefix = `${phase.id}:`,
          suffix = `:${oldId}`;
        if (!key.startsWith(prefix) || !key.endsWith(suffix)) continue;
        const date = key.slice(prefix.length, -suffix.length);
        const [year, month, day] = date.split("-").map(Number);
        if ((new Date(year, month - 1, day).getDay() + 6) % 7 === slot.day)
          data.blocks[`${prefix}${date}:${newId}`] = clone(value);
      }
    }
  }
  const library = new Map();
  for (const subject of [
    ...(Array.isArray(data.subjects) ? data.subjects : []),
    ...data.phases.flatMap((p) => p.subjects),
  ]) {
    if (
      subject &&
      typeof subject.id === "string" &&
      typeof subject.name === "string" &&
      !library.has(subject.id)
    )
      library.set(subject.id, {
        ...subject,
        tier: TIERS.includes(subject.tier) ? subject.tier : "B",
      });
  }
  data.subjects = [...library.values()];
  for (const phase of data.phases)
    for (const subject of phase.subjects) {
      const shared = library.get(subject.id);
      subject.name = shared.name;
      subject.color = shared.color;
    }
  // Old exports have no presets; never infer courses into a subject-free library.
  data.presets = Array.isArray(data.presets) ? data.presets : [];
  data.phase = data.phases.some((p) => p.id === data.phase)
    ? data.phase
    : (data.phases[0]?.id ?? null);
  for (const key of ["blocks", "notes", "handoffs"])
    if (!data[key] || typeof data[key] !== "object" || Array.isArray(data[key]))
      data[key] = {};
  data.audioItems = Array.isArray(data.audioItems)
    ? data.audioItems.filter(
        (item) =>
          item &&
          typeof item.id === "string" &&
          typeof item.title === "string" &&
          typeof item.url === "string",
      )
    : [];
  return data;
}
