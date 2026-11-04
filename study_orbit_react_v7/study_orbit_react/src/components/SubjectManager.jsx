import { memo, useState } from "react";
import { SUBJECT_COLORS, TIERS, priorityLabel, uid } from "../lib/planner.js";

/** @brief Edit the shared library even when no phase exists yet. */
function SubjectManager({ subjects, onSave, onDelete }) {
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [tier, setTier] = useState("A");
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState("");
  /** @brief Validate a library entry before updating its shared identity. */
  function submit(event) {
    event.preventDefault();
    if (!name.trim()) return setError("Enter a subject name.");
    if (
      subjects.some(
        (subject) =>
          subject.id !== editing &&
          subject.name.toLowerCase() === name.trim().toLowerCase(),
      )
    )
      return setError("That subject already exists.");
    onSave({
      ...subjects.find((subject) => subject.id === editing),
      id: editing || uid(),
      name: name.trim(),
      tier,
      color:
        subjects.find((subject) => subject.id === editing)?.color ||
        SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length],
    });
    setEditing(null);
    setName("");
    setTier("A");
    setError("");
  }
  return (
    <section className="panel section-panel subject-library">
      <h2>Subject library</h2>
      <p>
        Names are shared across phases. Default priorities are suggestions;
        phases keep their own priorities and hours.
      </p>
      <form className="add-subject" onSubmit={submit}>
        <label>
          Subject name
          <input
            value={name}
            maxLength={75}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Default priority
          <select
            value={tier}
            onChange={(event) => setTier(event.target.value)}
          >
            {TIERS.map((value) => (
              <option key={value} value={value}>
                {priorityLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-button" type="submit">
          {editing ? "Save subject" : "Add subject"}
        </button>
        {editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setName("");
            }}
          >
            Cancel
          </button>
        )}
      </form>
      {error && <p role="alert">{error}</p>}
      {subjects.map((subject) => (
        <div className="subject-editor" key={subject.id}>
          <strong>{subject.name}</strong>
          <small>Default priority {priorityLabel(subject.tier)}</small>
          <button
            className="secondary-button"
            aria-label={`Edit subject ${subject.name}`}
            onClick={() => {
              setEditing(subject.id);
              setName(subject.name);
              setTier(subject.tier);
            }}
          >
            Edit
          </button>
          <button
            className="secondary-button danger-button"
            aria-label={`Delete subject ${subject.name}`}
            onClick={() => setDeleting(subject.id)}
          >
            Delete
          </button>
          {deleting === subject.id && (
            <div className="inline-confirm" role="alert">
              <span>
                Remove this course from all phases, including fixed sessions and
                its next-step note?
              </span>
              <button
                className="secondary-button danger-button"
                onClick={() => {
                  onDelete(subject.id);
                  setDeleting(null);
                  if (editing === subject.id) {
                    setEditing(null);
                    setName("");
                  }
                }}
              >
                Delete everywhere
              </button>
              <button
                className="secondary-button"
                onClick={() => setDeleting(null)}
              >
                Cancel deletion
              </button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

export default memo(SubjectManager);
