import {
  Clock3,
  CheckCircle2,
  Coffee,
  NotebookPen,
  Sparkles,
} from "lucide-react";
import { formatCount, formatSlotTime, HANDOFF_MINUTES } from "../lib/time.js";
import { subjectName } from "../lib/planner.js";

/** @brief Explain the current study or handoff interval and its countdown. */
export default function DashboardWidget({
  phase,
  position,
  now,
  note,
  onEdit,
}) {
  const { mode, event, next } = position;
  const until =
    mode === "study"
      ? event.end - now
      : mode === "handoff"
        ? event.end.getTime() + HANDOFF_MINUTES * 60000 - now
        : next
          ? next.actualStart - now
          : 0;
  const pct =
    mode === "study"
      ? Math.max(
          0,
          Math.min(
            100,
            ((now - event.actualStart) / (event.end - event.actualStart)) * 100,
          ),
        )
      : mode === "handoff"
        ? Math.max(
            0,
            Math.min(
              100,
              ((now - event.end) / (HANDOFF_MINUTES * 60000)) * 100,
            ),
          )
        : 0;
  const currentTitle =
    event?.slot.title || subjectName(phase, event?.slot.subjectId);
  return (
    <section className="panel hero">
      <div className="hero-head">
        <span className={`status-label ${mode}`}>
          {mode === "study" ? (
            <>
              <span className="pulse-dot" /> FOCUS SESSION
            </>
          ) : mode === "handoff" ? (
            <>
              <NotebookPen size={14} /> PLANNING HANDOFF
            </>
          ) : (
            <>
              <Coffee size={14} /> UNSCHEDULED TIME
            </>
          )}
        </span>
        <Clock3 size={18} className="soft-icon" />
      </div>
      <h2 className="hero-title">
        {mode === "free"
          ? "Your time is yours."
          : mode === "handoff"
            ? `Wrap up: ${currentTitle}`
            : currentTitle}
      </h2>
      <p className="hero-subtitle">
        {mode === "study"
          ? `${formatSlotTime(event.slot.start)}–${formatSlotTime(event.slot.end)} · ${event.slot.fixed ? "Fixed commitment" : "Your scheduled focus time"}`
          : mode === "handoff"
            ? "Write a concrete next action while the material is fresh."
            : "Rest or prepare at your own pace. Optional time remains optional."}
      </p>
      {mode === "study" && (
        <div className="resume-card">
          <div className="resume-card-head">
            <span>
              <Sparkles size={14} /> PICK UP WHERE YOU LEFT OFF
            </span>
            <button
              className="text-button"
              onClick={() => onEdit(event.slot.subjectId)}
            >
              Edit next step
            </button>
          </div>
          <p>
            {note?.trim() ||
              "No next step saved yet. Choose one clear outcome for this session."}
          </p>
        </div>
      )}
      <div className="hero-bottom">
        <div>
          <span className="small-label">
            {mode === "study"
              ? "TIME UNTIL PLANNING"
              : mode === "handoff"
                ? "TIME LEFT TO PLAN"
                : "NEXT SESSION IN"}
          </span>
          <div className="countdown">
            {next || event ? formatCount(until) : "—"}
          </div>
        </div>
        <div className="hero-progress">
          <span>
            {mode === "free"
              ? "Your breaks are protected"
              : `${Math.round(pct)}% elapsed`}
          </span>
          <div className="progress-track">
            <div style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}
