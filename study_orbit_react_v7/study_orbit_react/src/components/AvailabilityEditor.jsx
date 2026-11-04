import { useState } from "react";
import { Plus, Trash2, Copy } from "lucide-react";
import { DAYS, formatHours } from "../lib/time.js";
import { uid } from "../lib/planner.js";
import {
  availableHours,
  validWindow,
  nextAvailabilityRange,
} from "../lib/availability.js";
import TimeRange from "./TimeRange.jsx";

/** @brief Edit subject-free study windows and recurring constraints without imposing a weekly total. */
export default function AvailabilityEditor({ windows, onChange }) {
  const [rowOrder, setRowOrder] = useState(null);
  const orderedWindows = [...windows].sort(
    (a, b) => a.day - b.day || a.start - b.start,
  );
  const visibleWindows = rowOrder
    ? [...windows].sort((a, b) => {
        const rank = (id) =>
          rowOrder.indexOf(id) < 0 ? rowOrder.length : rowOrder.indexOf(id);
        return rank(a.id) - rank(b.id);
      })
    : orderedWindows;
  const addWindow = (day, kind) => {
    const range = nextAvailabilityRange(
      windows,
      day,
      kind === "study" ? 120 : 60,
    );
    if (!range) return;
    onChange([...windows, { id: uid(), day, kind, ...range }]);
  };
  /** @brief Replace one entry while keeping the rest of the weekly draft intact. */
  function update(id, patch) {
    onChange(
      windows.map((window) =>
        window.id === id ? { ...window, ...patch } : window,
      ),
    );
  }
  /** @brief Copy a day's study windows and constraints to chosen days after an explicit click. */
  function copyWeekdays(day) {
    const source = windows.filter((window) => window.day === day);
    const destinations = [0, 1, 2, 3, 4].filter((value) => value !== day);
    // Append rather than replace; overlapping study windows are counted only once.
    onChange([
      ...windows,
      ...destinations.flatMap((target) =>
        source.map((window) => ({ ...window, id: uid(), day: target })),
      ),
    ]);
  }
  return (
    <div className="availability-editor">
      <div className="capacity-banner">
        <strong>
          {formatHours(availableHours(windows))}h available / week
        </strong>
        <span>
          This follows your actual windows, not a required target. Unavailable
          time is subtracted automatically.
        </span>
      </div>
      {DAYS.map((day, index) => (
        <section className="day-editor" key={day}>
          <div className="day-editor-title">
            <strong>{day}</strong>
            <div className="button-row">
              <button
                className="text-button"
                disabled={!windows.some((window) => window.day === index)}
                onClick={() => copyWeekdays(index)}
                aria-label={`Copy ${day} to weekdays`}
              >
                <Copy size={13} />
                Copy to weekdays
              </button>
            </div>
          </div>
          {visibleWindows
            .filter((window) => window.day === index)
            .map((window, number) => (
              <div
                className={`availability-row ${window.kind === "unavailable" ? "blocked-window" : ""}`}
                key={window.id}
                onFocusCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget))
                    setRowOrder(
                      (current) =>
                        current || visibleWindows.map((item) => item.id),
                    );
                }}
                onBlurCapture={(event) => {
                  if (
                    !event.currentTarget.contains(event.relatedTarget) &&
                    validWindow(window)
                  )
                    setRowOrder(null);
                }}
              >
                <label>
                  Type
                  <select
                    aria-label={`${day} window ${number + 1} type`}
                    value={window.kind}
                    onChange={(event) =>
                      update(window.id, { kind: event.target.value })
                    }
                  >
                    <option value="study">Study time</option>
                    <option value="unavailable">
                      Unavailable / university
                    </option>
                  </select>
                </label>
                <TimeRange
                  label={`${day} window ${number + 1} start`}
                  value={window.start}
                  onChange={(start) => update(window.id, { start })}
                />
                <TimeRange
                  label={`${day} window ${number + 1} end`}
                  value={window.end}
                  onChange={(end) => update(window.id, { end })}
                />
                <button
                  className="icon-button danger-button"
                  aria-label={`Remove ${day} window ${number + 1}`}
                  onClick={() =>
                    onChange(windows.filter((item) => item.id !== window.id))
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          <div className="button-row day-add-actions">
            <button
              className="secondary-button"
              disabled={!nextAvailabilityRange(windows, index)}
              onClick={() => addWindow(index, "study")}
            >
              <Plus size={14} />
              Add {day} study time
            </button>
            <button
              className="subtle-button"
              disabled={!nextAvailabilityRange(windows, index)}
              onClick={() => addWindow(index, "unavailable")}
            >
              Block unavailable time
            </button>
          </div>
        </section>
      ))}
      <p className="hint-block">
        Rows stay in place while you edit; they sort by start time when you
        leave a completed row. New rows start at the previous period’s end. A
        Tuesday 01:00 session can belong to Monday: set its times to +1 day in
        Monday’s plan. Use separate windows to leave breaks. Changing university
        hours only requires editing the blocked time.
      </p>
    </div>
  );
}
