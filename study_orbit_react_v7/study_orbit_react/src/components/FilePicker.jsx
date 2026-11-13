import { useId, useRef } from "react";
import { Upload } from "lucide-react";

/** Use a keyboard-accessible button while keeping the native file chooser behavior. */
export default function FilePicker({ accept, onChange, disabled, label, fileName, hint }) {
  const inputRef = useRef(null);
  const hintId = useId();
  return (
    <div className="file-picker">
      <button
        type="button"
        className="secondary-button file-picker-button"
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={16} aria-hidden="true" /> {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={onChange}
        disabled={disabled}
        aria-label={label}
        style={{ display: "none" }}
        hidden
      />
      {(fileName || hint) && (
        <div className="file-picker-copy">
          {fileName && <span className="file-picker-name" title={fileName}>{fileName}</span>}
          {hint && <small id={hintId} className="file-picker-hint">{hint}</small>}
        </div>
      )}
    </div>
  );
}
