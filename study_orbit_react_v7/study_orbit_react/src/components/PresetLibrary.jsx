import { memo, useRef, useState } from "react";
import { Plus, Pencil, Copy, Trash2, X, CalendarRange } from "lucide-react";
import { clone, uid } from "../lib/planner.js";
import {
  availableHours,
  presetErrors,
  starterWindows,
} from "../lib/availability.js";
import { formatHours } from "../lib/time.js";
import { useDialog } from "../hooks/useDialog.js";
import AvailabilityEditor from "./AvailabilityEditor.jsx";

/** @brief Keep availability editing local until a named reusable preset is saved. */
function PresetEditor({ initial, onSave, onClose }) {
  const [draft, setDraft] = useState(() => clone(initial));
  const [error, setError] = useState("");
  const dialogRef = useRef(null);
  useDialog(dialogRef, onClose);
  const issues = presetErrors(draft);
  return (
    <div className="dialog-backdrop">
      <section
        className="dialog preset-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preset-heading"
      >
        <div className="dialog-top">
          <span className="dialog-caption">
            <CalendarRange size={16} />
            YOUR WEEK, BEFORE COURSES
          </span>
          <button
            className="close-button"
            aria-label="Close preset editor"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <h2 id="preset-heading">Weekly availability preset</h2>
        <p>
          Set the times that suit your semester. No subjects or exact weekly
          quota needed.
        </p>
        <label className="phase-name-label">
          Preset name
          <input
            value={draft.name}
            maxLength={90}
            placeholder="e.g. Autumn semester — lectures in the morning"
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
          />
        </label>
        <label className="phase-name-label">
          Study needs / constraints
          <textarea
            value={draft.notes || ""}
            maxLength={1000}
            rows={2}
            placeholder="e.g. Keep weekends light; lectures may change in November."
            onChange={(event) =>
              setDraft({ ...draft, notes: event.target.value })
            }
          />
        </label>
        <AvailabilityEditor
          windows={draft.windows}
          onChange={(windows) => setDraft({ ...draft, windows })}
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-bottom">
          <span>
            Existing phases keep their own copy when this preset changes.
          </span>
          <button
            className="primary-button"
            onClick={() => {
              if (issues.length) return setError(issues.join(" "));
              onSave(draft);
            }}
          >
            Save preset
          </button>
        </div>
      </section>
    </div>
  );
}

/** @brief Manage persistent subject-free templates independently of semester phases. */
function PresetLibrary({ presets, onSave, onDelete, onBuild }) {
  const [draft, setDraft] = useState(null);
  const [deleting, setDeleting] = useState(null);
  return (
    <section className="panel section-panel preset-library">
      <div className="section-top">
        <div>
          <span className="panel-overline">START WITH YOUR TIME</span>
          <h2>Weekly presets</h2>
        </div>
        <button
          className="primary-button"
          onClick={() =>
            setDraft({ id: uid(), name: "", notes: "", windows: [] })
          }
        >
          <Plus size={16} />
          Create preset
        </button>
      </div>
      <p className="card-desc">
        Plan when you can study, then fit your semester’s courses into it. Save
        different weeks for changing university timetables.
      </p>
      {!presets.length && (
        <div className="preset-starters">
          <button
            className="secondary-button"
            onClick={() =>
              setDraft({
                id: uid(),
                name: "My 3 + 2 + 2 week",
                windows: starterWindows("classic"),
              })
            }
          >
            Start from 3 + 2 + 2
          </button>
          <button
            className="secondary-button"
            onClick={() =>
              setDraft({
                id: uid(),
                name: "My night-owl week",
                windows: starterWindows("night"),
              })
            }
          >
            Start from night owl
          </button>
        </div>
      )}
      <div className="preset-cards">
        {presets.map((preset) => (
          <article className="preset-card" key={preset.id}>
            <div>
              <h3>{preset.name}</h3>
              <strong>
                {formatHours(availableHours(preset.windows))}h available
              </strong>
              <p>{preset.notes || "Subject-free weekly availability"}</p>
            </div>
            <div className="button-row">
              <button
                className="primary-button"
                onClick={() => onBuild(preset)}
              >
                Build semester phase
              </button>
              <button
                className="secondary-button"
                aria-label={`Edit preset ${preset.name}`}
                onClick={() => setDraft(preset)}
              >
                <Pencil size={14} />
                Edit
              </button>
              <button
                className="icon-button"
                aria-label={`Duplicate preset ${preset.name}`}
                onClick={() =>
                  setDraft({
                    ...clone(preset),
                    id: uid(),
                    name: `${preset.name} — copy`,
                  })
                }
              >
                <Copy size={15} />
              </button>
              <button
                className="icon-button danger-button"
                aria-label={`Delete preset ${preset.name}`}
                onClick={() => setDeleting(preset.id)}
              >
                <Trash2 size={15} />
              </button>
            </div>
            {deleting === preset.id && (
              <div className="inline-confirm" role="alert">
                <span>
                  Delete this saved preset? Existing phases stay as they are.
                </span>
                <button
                  className="danger-button secondary-button"
                  onClick={() => {
                    onDelete(preset.id);
                    setDeleting(null);
                  }}
                >
                  Delete preset
                </button>
                <button
                  className="secondary-button"
                  onClick={() => setDeleting(null)}
                >
                  Cancel
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      {draft && (
        <PresetEditor
          key={draft.id}
          initial={draft}
          onClose={() => setDraft(null)}
          onSave={(preset) => {
            onSave(preset);
            setDraft(null);
          }}
        />
      )}
    </section>
  );
}
export default memo(PresetLibrary);
