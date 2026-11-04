import { hoursBySubject } from "./planner.js";
const percent = (done, total) =>
  total > 0
    ? done >= total
      ? 100
      : Math.min(99, Math.round((done / total) * 100))
    : 0;
/** Compare actual marked hours with the scheduled plan, never multiply them by priority. */
export function allocationProgress(phase, completed = {}) {
  const hours = hoursBySubject(phase);
  const rows = phase.subjects.map((subject) => {
    const scheduled = hours[subject.id] || 0;
    const raw = Number(completed[subject.id]);
    const done = Math.min(
      scheduled,
      Number.isFinite(raw) ? Math.max(0, raw) : 0,
    );
    const goal = Math.max(0, Number(phase.targetHours[subject.id]) || 0);
    return {
      subject,
      scheduled,
      done,
      goal,
      remaining: scheduled - done,
      percent: percent(done, scheduled),
      complete: scheduled > 0 && done >= scheduled,
    };
  });
  const total = rows.reduce((sum, row) => sum + row.scheduled, 0);
  const done = rows.reduce((sum, row) => sum + row.done, 0);
  return {
    rows,
    total,
    done,
    percent: percent(done, total),
    complete: total > 0 && done >= total,
  };
}
