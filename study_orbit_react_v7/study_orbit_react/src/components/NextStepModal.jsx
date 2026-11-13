import { useDialog } from "../hooks/useDialog.js";
import { NotebookPen, X, CheckCircle2, Timer } from "lucide-react";
import { useEffect, useRef } from "react";
import { formatCount, HANDOFF_MINUTES } from "../lib/time.js";

/** @brief Autosave the subject handoff note while allowing the user to dismiss planning. */
export default function NextStepModal({
  editor,
  subjectName,
  text,
  onChange,
  onCommit,
  onDiary,
  onClose,
  now,
}) {
  const inputRef = useRef(null);
  useEffect(() => {
    if (editor) inputRef.current?.focus();
  }, [editor?.subjectId, editor?.token]);

  const dialogRef = useRef(null);
  useDialog(dialogRef, onClose);
  if (!editor) return null;
  const auto = editor.source === "auto";
  const end = editor.end ? new Date(editor.end) : null;
  const countdown =
    auto && end
      ? formatCount(end.getTime() + HANDOFF_MINUTES * 60000 - now)
      : null;
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="dialog handoff-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="handoffTitle"
      >
        <div className="dialog-top">
          <span className="dialog-caption">
            <NotebookPen size={17} /> NEXT SESSION PLAN
          </span>
          <button className="close-button" aria-label="Close" onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        <div className="handoff-heading">
          <div>
            <h2 id="handoffTitle">Next time: {subjectName}</h2>
            <p>
              Leave a next step, or open the study log to record what you did.
              You can return from the calendar at any time.
            </p>
          </div>
          {auto && (
            <span className="handoff-countdown">
              <Timer size={15} />
              {countdown?.slice(3)}
            </span>
          )}
        </div>
        <label className="editor-label" htmlFor="nextStepContent">
          START HERE NEXT TIME
        </label>
        <textarea
          id="nextStepContent"
          ref={inputRef}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          placeholder="For example: Continue with TLS remote attestation §4; check the reference values and finish the diagram."
          rows={6}
        />
        <div className="editor-tip">
          <CheckCircle2 size={16} /> Changes are saved automatically to your
          local JSON file.
        </div>
        <div className="dialog-bottom">
          <span>
            {auto
              ? "The handoff is a reminder; you can keep editing after it ends."
              : "You can update this note whenever you want."}
          </span>
          <div className="header-actions">
            <button className="secondary-button" onClick={onDiary}>Open study log</button>
            <button className="primary-button" onClick={onClose}>Done — continue</button>
          </div>
        </div>
      </section>
    </div>
  );
}
