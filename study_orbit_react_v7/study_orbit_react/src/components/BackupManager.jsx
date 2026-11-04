import { backupName } from "../lib/backupNames.js";
import { useDialog } from "../hooks/useDialog.js";
import { useEffect, useState, useRef } from "react";
import {
  Archive,
  HardDriveDownload,
  RotateCcw,
  Upload,
  X,
  FileJson,
  FolderOpen,
} from "lucide-react";

/** @brief Offer confirmed restore, portable import/export, and local snapshots. */
export default function BackupManager({
  onClose,
  onSave,
  onRestore,
  onImport,
  onExport,
}) {
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  /** @brief Refresh the list of complete local snapshots and report errors. */
  const reload = async () => {
    try {
      const result = await onSave("list");
      setList(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    reload();
  }, []);
  /** @brief Create a snapshot and refresh its entry in the backup list. */
  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await onSave("create");
      setMessage(`Created ${result.name}`);
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  /** @brief Confirm replacement before restoring the selected snapshot. */
  const restore = async (name) => {
    if (
      !window.confirm(
        `Restore “${name}”? Your current state will be replaced. Consider saving a snapshot first.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await onRestore(name);
      setMessage("State restored successfully.");
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  /** @brief Read a chosen JSON file and confirm replacing the current workspace. */
  const fileImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const json = JSON.parse(await file.text());
      if (
        !window.confirm(
          "Import this v6/v7 JSON backup? It replaces your current state.",
        )
      )
        return;
      await onImport(json);
      setMessage("Imported backup successfully.");
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };
  /** @brief Download a portable JSON copy after pending autosaves finish. */
  const exportJson = async () => {
    setBusy(true);
    setError("");
    try {
      const state = await onExport();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(state, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      const phase = state.phases.find((phase) => phase.id === state.phase);
      link.download = backupName(
        phase?.name,
        new Date(),
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        "export",
      ).replace(/__export$/, ".json");
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };
  const dialogRef = useRef(null);
  useDialog(dialogRef, () => {
    if (!busy) onClose();
  });
  return (
    <div className="dialog-backdrop">
      <section
        className="dialog backup-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="backupTitle"
      >
        <div className="dialog-top">
          <span className="dialog-caption">
            <Archive size={17} /> LOCAL SNAPSHOTS
          </span>
          <button
            className="close-button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close backups"
          >
            <X size={20} />
          </button>
        </div>
        <h2 id="backupTitle">Save and restore your workspace</h2>
        <p className="backup-desc">
          The complete contents of <code>Current_State/</code> are copied into a
          timestamped folder under <code>Backups/</code>. Nothing is uploaded
          online.
        </p>
        <div className="backup-actions">
          <button disabled={busy} onClick={exportJson}>
            Export JSON
          </button>
          <button className="primary-button" disabled={busy} onClick={create}>
            <HardDriveDownload size={17} /> Save State
          </button>
          <label className="import-button">
            <Upload size={16} /> Import v6/v7 JSON
            <input
              type="file"
              accept=".json,application/json"
              onChange={fileImport}
              disabled={busy}
              hidden
            />
          </label>
        </div>
        <div className="backup-list-head">
          <strong>Available snapshots</strong>
          <small>{list.length} backups</small>
        </div>
        <div className="backup-list">
          {loading ? (
            <p>Loading...</p>
          ) : !list.length ? (
            <div className="empty-small">
              <FolderOpen size={22} />
              <p>
                No snapshots yet. Select “Save State” to create your first one.
              </p>
            </div>
          ) : (
            list.map((item) => (
              <div key={item.name} className="backup-entry">
                <div className="backup-entry-icon">
                  <FileJson size={19} />
                </div>
                <div>
                  <strong>{item.name}</strong>
                  <small>{new Date(item.createdAt).toLocaleString()}</small>
                </div>
                <button disabled={busy} onClick={() => restore(item.name)}>
                  <RotateCcw size={15} /> Restore
                </button>
              </div>
            ))
          )}
        </div>
        {(error || message) && (
          <p className={error ? "form-error" : "form-success"} role="status">
            {error || message}
          </p>
        )}
      </section>
    </div>
  );
}
