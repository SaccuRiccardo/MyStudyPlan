import { Save, ArchiveRestore } from "lucide-react";
import Sidebar from "./components/Sidebar.jsx";

/** @brief Provide the persistent application shell and save-status feedback. */
export default function Layout({
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
  onSaveState,
  saving,
  children,
}) {
  return (
    <div className="app-shell">
      <Sidebar
        data={data}
        now={now}
        activePhase={activePhase}
        hoursDone={hoursDone}
        onPhase={onPhase}
        onCreate={onCreate}
        onEdit={onEdit}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onTheme={onTheme}
        onBackups={onBackups}
      />
      <main className="main-area">
        <header className="main-header">
          <div>
            <span className="eyebrow">THE WORKSPACE</span>
            <h1>
              Make today count<span className="accent-dot">.</span>
            </h1>
            <p>
              A little progress, every day. Build a rhythm that works for you.
            </p>
          </div>
          <div className="header-actions">
            <span
              className={`save-indicator ${saving === "error" ? "error" : ""}`}
            >
              {saving === "saving"
                ? "● Saving…"
                : saving === "error"
                  ? "● Save failed"
                  : "✓ Saved locally"}
            </span>
            <button className="secondary-button" onClick={onBackups}>
              <ArchiveRestore size={16} /> Backups
            </button>
            <button className="primary-button" onClick={onSaveState}>
              <Save size={16} /> Save State
            </button>
          </div>
        </header>
        {children}
        <footer className="app-footer">
          Study Orbit v7 · React + Vite + local Express file storage · evenings
          are yours.
        </footer>
      </main>
    </div>
  );
}
