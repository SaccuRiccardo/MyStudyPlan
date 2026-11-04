import {
  ChevronRight,
  CirclePlus,
  Copy,
  Pencil,
  Trash2,
  Orbit,
  Sun,
  Moon,
  ArchiveRestore,
  Monitor,
} from "lucide-react";
import { formatClock, displayDate, formatHours } from "../lib/time.js";
import { scheduledHours } from "../lib/planner.js";

/** @brief Navigate phases and display local time and marked weekly progress. */
export default function Sidebar({
  data,
  now,
  activePhase,
  hoursDone,
  onPhase,
  onCreate,
  onEdit,
  onDuplicate,
  onDelete,
  onTheme,
  onBackups,
}) {
  const total = activePhase ? scheduledHours(activePhase) : 0;
  const pct = total ? Math.min(100, (hoursDone / total) * 100) : 0;
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">
          <Orbit size={23} />
        </div>
        <div>
          Study <span>Orbit</span>
          <small>YOUR PERSONAL WORKSPACE</small>
        </div>
      </div>
      <div className="side-divider" />
      <div>
        <p className="eyebrow">LOCAL TIME</p>
        <div className="side-clock">{formatClock(now).slice(0, 5)}</div>
        <div className="side-date">{displayDate(now)}</div>
      </div>
      <div className="sidebar-section">
        <div className="sidebar-title">
          <span>YOUR PHASES</span>
          <button
            className="icon-button tiny"
            title="Create phase"
            onClick={onCreate}
          >
            <CirclePlus size={18} />
          </button>
        </div>
        <div className="phase-list">
          {data.phases.map((p) => (
            <button
              key={p.id}
              className={`phase-choice ${data.phase === p.id ? "selected" : ""}`}
              onClick={() => onPhase(p.id)}
            >
              <span className="phase-mark" />
              <span className="phase-copy">
                <strong>{p.name}</strong>
                <small>
                  {formatHours(scheduledHours(p))}h / week · {p.subjects.length}{" "}
                  subjects
                </small>
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
        </div>
        {activePhase && (
          <div className="phase-actions">
            <button title="Edit phase" onClick={onEdit}>
              <Pencil size={14} /> Edit
            </button>
            <button title="Duplicate phase" onClick={onDuplicate}>
              <Copy size={14} /> Copy
            </button>
            <button title="Delete phase" onClick={onDelete}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        )}
        <button className="subtle-button full" onClick={onCreate}>
          <CirclePlus size={15} /> Create a phase
        </button>
      </div>
      <div className="sidebar-spacer" />
      <div className="progress-box">
        <p className="eyebrow">THIS WEEK</p>
        <div className="progress-large">
          {formatHours(hoursDone)} <span>/ {formatHours(total)}h</span>
        </div>
        <div className="progress-track">
          <div style={{ width: `${pct}%` }} />
        </div>
        <p>{Math.round(pct)}% of planned hours marked complete (not timed)</p>
      </div>
      <div className="sidebar-bottom">
        <button
          className="icon-button"
          title="Switch theme"
          aria-label="Toggle light / dark theme"
          onClick={onTheme}
        >
          {data.theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button
          className="icon-button"
          title="Snapshots and restore"
          aria-label="Open backups"
          onClick={onBackups}
        >
          <ArchiveRestore size={18} />
        </button>
        <button
          className="icon-button"
          title="Fullscreen"
          aria-label="Toggle fullscreen"
          onClick={() =>
            document.fullscreenElement
              ? document.exitFullscreen()
              : document.documentElement.requestFullscreen()
          }
        >
          <Monitor size={18} />
        </button>
      </div>
      <p className="local-only">
        Your data lives in <code>Current_State/</code> on this computer.
      </p>
    </aside>
  );
}
