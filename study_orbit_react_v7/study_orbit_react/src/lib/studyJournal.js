import { blockKey, dateKey, parseDate } from "./time.js";

const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const fields = ["work", "nextStep", "done", "goal"];
const timestamp = (value) =>
  typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
const validDate = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  dateKey(parseDate(value)) === value;
const content = (value = {}) => ({
  work: typeof value.work === "string" ? value.work : "",
  nextStep: typeof value.nextStep === "string" ? value.nextStep : "",
  done: value.done === true,
  goal: typeof value.goal === "string" ? value.goal : "",
});
const meaningful = (value) =>
  value.done || value.work.trim() || value.nextStep.trim() || value.goal.trim();
const sameContent = (left, right) => fields.every((field) => left[field] === right[field]);
const newId = () => globalThis.crypto?.randomUUID?.() ||
  `journal-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Return a useful validation error before malformed diary data can reach disk. */
export function journalValidationError(journal) {
  if (!record(journal)) return "Expected a journal object.";
  for (const [key, entry] of Object.entries(journal)) {
    if (!record(entry) || entry.id !== key || !key ||
        typeof entry.subjectId !== "string" || !entry.subjectId ||
        typeof entry.subjectName !== "string" ||
        !(entry.phaseId === null || typeof entry.phaseId === "string") ||
        typeof entry.phaseName !== "string" ||
        !(entry.slotId === null || typeof entry.slotId === "string") ||
        !validDate(entry.date) || !(entry.createdAt === null || timestamp(entry.createdAt)) ||
        !(entry.updatedAt === null || timestamp(entry.updatedAt)) ||
        fields.some((field) => typeof entry[field] !== (field === "done" ? "boolean" : "string")) ||
        !Array.isArray(entry.revisions)) return "Invalid study journal entry.";
    if ((entry.start === null) !== (entry.end === null) ||
        (entry.start !== null && (!Number.isFinite(entry.start) || !Number.isFinite(entry.end) ||
          entry.start < 0 || entry.end > 2880 || entry.end <= entry.start)))
      return "Invalid study journal session times.";
    if (entry.revisions.some((revision) => !record(revision) || !(revision.savedAt === null || timestamp(revision.savedAt)) ||
        fields.some((field) => typeof revision[field] !== (field === "done" ? "boolean" : "string"))))
      return "Invalid study journal revision.";
  }
  return null;
}

/** Keep independently valid diary records when opening an older or partially damaged export. */
export function normalizeJournal(raw) {
  if (!record(raw)) return {};
  return Object.fromEntries(Object.entries(raw)
    .filter(([key, entry]) => !journalValidationError({ [key]: entry }))
    .map(([key, entry]) => [key, structuredClone(entry)]));
}

/** Save an explicit diary edit, retaining the session's original timetable snapshot. */
export function saveJournalEntry(state, context, patch, at = new Date().toISOString()) {
  if (!context || typeof context.subjectId !== "string" || !context.subjectId || !validDate(context.date))
    throw new Error("Choose a subject and a valid study date.");
  if (!timestamp(at)) throw new Error("Invalid diary save timestamp.");
  state.journal ||= {};
  state.blocks ||= {};
  state.handoffs ||= {};
  const scheduled = typeof context.phaseId === "string" && typeof context.slotId === "string";
  const id = context.id || (scheduled
    ? blockKey(context.phaseId, parseDate(context.date), context.slotId)
    : newId());
  const stored = state.journal[id];
  if (stored && (stored.subjectId !== context.subjectId || stored.date !== context.date))
    throw new Error("This diary entry belongs to a different subject or date.");
  const previous = stored || (scheduled ? state.blocks[id] : null);
  const before = content(previous || {});
  const next = { ...before };
  for (const field of fields) {
    if (!own(patch, field)) continue;
    if (typeof patch[field] !== (field === "done" ? "boolean" : "string"))
      throw new Error(`Invalid journal ${field}.`);
    next[field] = patch[field];
  }
  let entry = stored;
  if (!entry) {
    entry = {
      id,
      subjectId: context.subjectId,
      subjectName: context.subjectName || "Subject",
      phaseId: context.phaseId || null,
      phaseName: context.phaseName || "",
      date: context.date,
      slotId: context.slotId || null,
      start: Number.isFinite(context.start) ? context.start : null,
      end: Number.isFinite(context.end) ? context.end : null,
      ...before,
      createdAt: timestamp(previous?.createdAt) ? previous.createdAt : at,
      updatedAt: at,
      revisions: [],
    };
  }
  if (!stored || !sameContent(entry, next)) {
    if (previous && meaningful(before) && !entry.revisions.length && !sameContent(before, next))
      entry = { ...entry, revisions: [{ savedAt: timestamp(previous.updatedAt) ? previous.updatedAt : null, ...before }] };
    entry = { ...entry, ...next, updatedAt: at,
      revisions: [...entry.revisions, { savedAt: at, ...next }] };
    const error = journalValidationError({ [id]: entry });
    if (error) throw new Error(error);
    state.journal[id] = entry;
  }
  if (entry.slotId !== null && entry.phaseId !== null) {
    state.blocks[id] = { ...state.blocks[id], ...content(entry), updatedAt: entry.updatedAt };
  }
  // A diary-only correction must never replace a newer next-session plan.
  if (own(patch, "nextStep"))
    state.handoffs[context.subjectId] = { text: patch.nextStep, updatedAt: at };
  return entry;
}

/** Read semester history, including recoverable completion/goal records from older versions. */
export function journalEntriesForSubject(state, subjectId) {
  const entries = new Map(Object.values(state.journal || {})
    .filter((entry) => entry.subjectId === subjectId)
    .map((entry) => [entry.id, entry]));
  for (const phase of state.phases || []) {
    const subject = phase.subjects.find((item) => item.id === subjectId);
    if (!subject) continue;
    const prefix = `${phase.id}:`;
    for (const slot of phase.slots.filter((item) => item.subjectId === subjectId)) {
      const suffix = `:${slot.id}`;
      for (const [id, info] of Object.entries(state.blocks || {})) {
        if (entries.has(id) || !id.startsWith(prefix) || !id.endsWith(suffix) || !record(info)) continue;
        const date = id.slice(prefix.length, -suffix.length);
        if (!validDate(date) || !meaningful(content(info))) continue;
        entries.set(id, {
          id, subjectId, subjectName: subject.name, phaseId: phase.id,
          phaseName: phase.name, date, slotId: slot.id, start: slot.start, end: slot.end,
          ...content(info),
          createdAt: timestamp(info.createdAt) ? info.createdAt : null,
          updatedAt: timestamp(info.updatedAt) ? info.updatedAt : null,
          revisions: [], legacy: true,
        });
      }
    }
  }
  return [...entries.values()].sort((a, b) => b.date.localeCompare(a.date) ||
    (b.start ?? -1) - (a.start ?? -1) || a.id.localeCompare(b.id));
}

/** Freeze recoverable older records before a timetable or library item is removed. */
export function preserveJournalHistory(state) {
  state.journal ||= {};
  const subjectIds = new Set((state.phases || []).flatMap((phase) =>
    phase.subjects.map((subject) => subject.id)));
  for (const subjectId of subjectIds)
    for (const entry of journalEntriesForSubject(state, subjectId))
      if (!state.journal[entry.id]) state.journal[entry.id] = structuredClone(entry);
  return state.journal;
}
