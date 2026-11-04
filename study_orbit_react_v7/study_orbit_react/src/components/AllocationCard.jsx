import { CheckCircle2 } from "lucide-react";
import { priorityLabel } from "../lib/planner.js";
import { allocationProgress } from "../lib/allocationProgress.js";
import { formatHours, parseDate } from "../lib/time.js";

/** Weekly completion follows marked sessions; effort priorities remain visible. */
export default function AllocationCard({ phase, completed = {}, weekStart }) {
  const progress = allocationProgress(phase, completed);
  return (
    <section
      className="panel section-panel allocation-card"
      aria-labelledby="allocationHeading"
    >
      <div className="section-top">
        <div>
          <span className="panel-overline">WORKLOAD</span>
          <h2 id="allocationHeading">Weekly allocation</h2>
        </div>
        <span className="hours-bubble">
          {formatHours(progress.total)}h planned
        </span>
      </div>
      <p className="card-desc">
        {weekStart
          ? `Week of ${parseDate(weekStart).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}. `
          : ""}
        Mark a block complete in the daily schedule to grow your progress. Hours
        reflect marked sessions.
      </p>
      <div
        className={`allocation-summary ${progress.complete ? "is-complete" : ""}`}
      >
        <div className="allocation-summary-heading">
          <strong>
            {formatHours(progress.done)} / {formatHours(progress.total)}h
            complete
          </strong>
          <span>
            {progress.complete && <CheckCircle2 size={17} />} {progress.percent}
            %
          </span>
        </div>
        <div
          className="allocation-overall"
          role="progressbar"
          aria-label="Weekly scheduled hours completed"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.percent}
          aria-valuetext={`${formatHours(progress.done)} of ${formatHours(progress.total)} scheduled hours marked complete`}
        >
          {progress.rows
            .filter((row) => row.scheduled > 0)
            .map((row) => (
              <div
                className="allocation-segment"
                key={row.subject.id}
                style={{
                  width: `${(row.scheduled / progress.total) * 100}%`,
                  "--subject-color": row.subject.color,
                }}
              >
                <div style={{ width: `${row.percent}%` }} />
              </div>
            ))}
        </div>
        <small>
          {progress.complete
            ? "All scheduled sessions complete. Nice work!"
            : progress.total
              ? `${formatHours(progress.total - progress.done)}h left in this week’s plan · colors show each subject’s share`
              : "No sessions scheduled yet."}
        </small>
      </div>
      <div className="allocation-items">
        {progress.rows.map((row) => (
          <div
            className={`allocation-item ${row.complete ? "is-complete" : ""}`}
            key={row.subject.id}
            style={{ "--subject-color": row.subject.color || "#607486" }}
          >
            <div className="allocation-row-heading">
              <strong>
                <i />
                {row.subject.name}
              </strong>
              <span className="allocation-effort">
                {priorityLabel(row.subject.tier)}
                {row.subject.kind === "flexible" ? " · Any subject" : ""}
              </span>
            </div>
            <div className="allocation-row-status">
              <span>
                {formatHours(row.done)} / {formatHours(row.scheduled)}h complete
              </span>
              <strong>
                {row.complete ? (
                  <>
                    <CheckCircle2 size={15} /> Sessions complete
                  </>
                ) : row.scheduled ? (
                  `${row.percent}%`
                ) : (
                  "Not scheduled"
                )}
              </strong>
            </div>
            <div
              className="allocation-completion-track"
              role="progressbar"
              aria-label={`${row.subject.name} scheduled hours completed`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={row.percent}
              aria-valuetext={`${formatHours(row.done)} of ${formatHours(row.scheduled)} scheduled hours marked complete`}
            >
              <div style={{ width: `${row.percent}%` }} />
            </div>
            <div className="allocation-goal">
              <span>Weekly goal: {formatHours(row.goal)}h</span>
              <span>
                {row.goal > row.scheduled
                  ? `${formatHours(row.goal - row.scheduled)}h still to schedule`
                  : row.scheduled > row.goal
                    ? `${formatHours(row.scheduled - row.goal)}h above goal`
                    : row.scheduled
                      ? "Goal fully scheduled"
                      : "Set hours in the phase planner"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
