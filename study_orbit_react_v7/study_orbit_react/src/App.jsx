import PresetLibrary from "./components/PresetLibrary.jsx";
import { progressForWeek } from "./lib/progress.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus2, ArrowRight, ShieldCheck } from "lucide-react";
import SubjectManager from "./components/SubjectManager.jsx";
import { saveSubject, deleteSubject } from "./lib/subjects.js";
import Layout from "./Layout.jsx";
import DashboardWidget from "./components/DashboardWidget.jsx";
import NextBlock from "./components/NextBlock.jsx";
import WeekCalendar from "./components/WeekCalendar.jsx";
import WeeklySchedule from "./components/WeeklySchedule.jsx";
import AllocationCard from "./components/AllocationCard.jsx";
import FocusShelf from "./components/FocusShelf.jsx";
import NextStepModal from "./components/NextStepModal.jsx";
import PhasePlanner from "./components/PhasePlanner.jsx";
import BackupManager from "./components/BackupManager.jsx";
import { api } from "./lib/api.js";
import { clone, normalizeState, subjectName, uid } from "./lib/planner.js";
import { migrateExport } from "./lib/legacy.js";
import {
  dateKey,
  getSchedulePosition,
  mondayFor,
  parseDate,
} from "./lib/time.js";
import { useClock } from "./hooks/useClock.js";

/** @brief Coordinate the active phase, live clock, local saves, and dialogs. */
export default function App() {
  const now = useClock();
  const [data, setData] = useState(null);
  const dataRef = useRef(null);
  const [bootError, setBootError] = useState("");
  const [saving, setSaving] = useState("saved");
  const saveTimer = useRef(null);
  const saveQueue = useRef(Promise.resolve());
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [followToday, setFollowToday] = useState(true);
  const [wizard, setWizard] = useState(null);
  const [view, setView] = useState("focus");
  const [backupsOpen, setBackupsOpen] = useState(false);
  const [editor, setEditor] = useState(null);
  const dismissed = useRef(new Set());
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    api
      .readState()
      .then((result) => {
        if (active) {
          const normalized = normalizeState(result);
          dataRef.current = normalized;
          setData(normalized);
        }
      })
      .catch((error) => {
        if (active) setBootError(error.message);
      });
    return () => {
      active = false;
    };
  }, []);

  /** @brief Serialize client saves so older responses cannot overwrite newer edits. */
  const enqueueSave = useCallback((snapshot) => {
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(() => api.writeState(snapshot));
    return saveQueue.current;
  }, []);
  /** @brief Persist pending edits before a backup, import, or export operation. */
  const flush = useCallback(async () => {
    clearTimeout(saveTimer.current);
    const snapshot = dataRef.current;
    if (!snapshot) throw new Error("State has not loaded.");
    setSaving("saving");
    await enqueueSave(snapshot);
    setSaving("saved");
  }, [enqueueSave]);

  /** @brief Apply a state edit synchronously to both the current reference and React. */
  const change = useCallback(
    (mutator, keys = ["subjects", "phases", "handoffs"]) => {
      const current = dataRef.current;
      const snapshot = { ...current };
      for (const key of keys) snapshot[key] = clone(current[key]);
      mutator(snapshot);
      dataRef.current = snapshot;
      setData(snapshot);
    },
    [],
  );

  useEffect(() => {
    if (!data) return;
    document.documentElement.dataset.theme = data.theme;
    setSaving("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      enqueueSave(data)
        .then(() => {
          if (dataRef.current === data) setSaving("saved");
        })
        .catch((error) => {
          setSaving("error");
          setNotice(`Could not save locally: ${error.message}`);
        });
    }, 350);
    return () => clearTimeout(saveTimer.current);
  }, [data, enqueueSave]);

  useEffect(() => {
    const warnBeforeClose = (event) => {
      if (saving === "saved") return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeClose);
    return () => window.removeEventListener("beforeunload", warnBeforeClose);
  }, [saving]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5500);
    return () => clearTimeout(timer);
  }, [notice]);
  const activePhase = useMemo(
    () => data?.phases.find((p) => p.id === data.phase) || null,
    [data?.phases, data?.phase],
  );
  const position = useMemo(
    () => getSchedulePosition(activePhase, now),
    [activePhase, now],
  );
  const activeSubjectId = position.event?.slot.subjectId;
  const note = activeSubjectId
    ? data?.handoffs[activeSubjectId]?.text || ""
    : "";
  const weekKey = dateKey(mondayFor(position.event?.base || now));
  const weeklyProgress = useMemo(
    () => progressForWeek(activePhase, data?.blocks || {}, parseDate(weekKey)),
    [activePhase, data?.blocks, weekKey],
  );
  const hoursDone = weeklyProgress.markedHours;
  const allocationWeek = dateKey(mondayFor(parseDate(selectedDate)));
  const allocationCompletion = useMemo(
    () =>
      progressForWeek(
        activePhase,
        data?.blocks || {},
        parseDate(allocationWeek),
      ),
    [activePhase, data?.blocks, allocationWeek],
  );

  const eventToken =
    position.event && activePhase
      ? `${activePhase.id}:${dateKey(position.event.base)}:${position.event.slot.id}`
      : null;
  // Only the live countdown needs one-second renders; the calendar changes at transitions or midnight.
  const calendarStatus = useMemo(
    () => ({ mode: position.mode, event: position.event }),
    [position.mode, eventToken],
  );
  const todayKey = dateKey(now);
  const calendarToday = useMemo(() => parseDate(todayKey), [todayKey]);
  useEffect(() => {
    if (!data || wizard || backupsOpen) return;
    if (
      position.mode === "handoff" &&
      eventToken &&
      !dismissed.current.has(eventToken)
    ) {
      setEditor((old) =>
        old?.source === "manual"
          ? old
          : old?.token === eventToken
            ? old
            : {
                subjectId: activeSubjectId,
                source: "auto",
                token: eventToken,
                end: position.event.end.toISOString(),
              },
      );
    } else if (position.mode !== "handoff")
      setEditor((old) => (old?.source === "auto" ? null : old));
  }, [
    data?.phase,
    position.mode,
    eventToken,
    activeSubjectId,
    position.event?.end?.getTime(),
    Boolean(wizard),
    backupsOpen,
  ]);

  /** @brief Open a manually editable next-step note for a subject. */
  const openEditor = useCallback((subjectId) => {
    setEditor({ subjectId, source: "manual" });
  }, []);
  /** @brief Dismiss planning without losing autosaved text or reopening the same handoff. */
  const closeEditor = useCallback(() => {
    setEditor((old) => {
      if (old?.source === "auto") dismissed.current.add(old.token);
      return null;
    });
  }, []);
  /** @brief Store the next action under stable subject identity across phases. */
  const editNextStep = (text) =>
    change(
      (d) => {
        d.handoffs[editor.subjectId] = {
          text,
          updatedAt: new Date().toISOString(),
        };
      },
      ["handoffs"],
    );

  /** @brief Finish pending edits before copying a complete local snapshot. */
  const saveStateBackup = async (type) => {
    if (type === "list") return api.listBackups();
    await flush();
    const result = await api.createBackup();
    setNotice(`Saved snapshot ${result.name}`);
    return result;
  };
  /** @brief Load a confirmed snapshot and reset views to the restored workspace. */
  const restoreBackup = async (name) => {
    await flush();
    const restored = normalizeState(await api.restoreBackup(name));
    dataRef.current = restored;
    setData(restored);
    setEditor(null);
    setWizard(null);
    setSelectedDate(dateKey(new Date()));
    setFollowToday(true);
    dismissed.current.clear();
    setNotice("Snapshot restored.");
  };
  /** @brief Validate and persist an imported workspace before replacing the visible state. */
  const importBackup = async (raw) => {
    await flush();
    const next = normalizeState(migrateExport(raw));
    await enqueueSave(next);
    dataRef.current = next;
    setData(next);
    setEditor(null);
    setWizard(null);
    setNotice("Imported Study Orbit JSON file into Current_State/.");
  };
  /** @brief Activate a phase while resetting transient editors and day selection. */
  const switchPhase = (id) => {
    setView("focus");
    change((d) => {
      d.phase = id;
    }, []);
    setEditor(null);
    dismissed.current.clear();
    setFollowToday(true);
    setSelectedDate(dateKey(new Date()));
  };
  /** @brief Create an isolated phase draft or independent duplicate. */
  const openWizard = (mode) => {
    if (mode === "create")
      setWizard({ mode: "create", phase: null, key: uid() });
    else if (activePhase) {
      const copy = clone(activePhase);
      if (mode === "duplicate") {
        copy.id = uid();
        copy.name = `${copy.name} — copy`;
        copy.slots.forEach((slot) => {
          slot.id = uid();
          delete slot.protected;
        });
      }
      setWizard({ mode, phase: copy, key: uid() });
    }
    setEditor(null);
  };
  /** @brief Commit a draft and synchronize shared subject names without changing other phase settings. */
  const savePhase = (phase) => {
    setView("focus");
    change((d) => {
      for (const subject of phase.subjects)
        saveSubject(
          d,
          d.subjects.find((s) => s.id === subject.id)
            ? {
                ...d.subjects.find((s) => s.id === subject.id),
                name: subject.name,
                color: subject.color,
              }
            : subject,
        );
      const existing = d.phases.findIndex((p) => p.id === phase.id);
      if (existing >= 0) d.phases[existing] = phase;
      else d.phases.push(phase);
      d.phase = phase.id;
    });
    setWizard(null);
    setNotice("Phase saved.");
  };
  /** @brief Remove only the selected phase after explicit user confirmation. */
  const deletePhase = () => {
    if (
      !activePhase ||
      !window.confirm(
        `Delete “${activePhase.name}”? The schedule will be removed. You can restore a previous snapshot.`,
      )
    )
      return;
    change((d) => {
      d.phases = d.phases.filter((p) => p.id !== activePhase.id);
      d.phase = d.phases[0]?.id || null;
    });
    setEditor(null);
  };
  /** @brief Update one dated block without affecting other weeks. */
  const progressChange = useCallback(
    (key, patch) =>
      change(
        (d) => {
          d.blocks[key] = { ...d.blocks[key], ...patch };
        },
        ["blocks"],
      ),
    [change],
  );
  /** @brief Autosave the selected date reminder. */
  const optionalNoteChange = useCallback(
    (text) =>
      change(
        (d) => {
          d.notes[selectedDate] = text;
        },
        ["notes"],
      ),
    [change, selectedDate],
  );
  /** @brief Allow manual week browsing or return to following today. */
  const selectDate = useCallback((key) => {
    setSelectedDate(key);
    setFollowToday(key === dateKey(new Date()));
  }, []);
  /** @brief Persist the requested appearance. */
  const themeChange = () =>
    change((d) => {
      d.theme = d.theme === "dark" ? "light" : "dark";
    }, []);

  /** @brief Save reusable availability without changing the phases that copied it earlier. */
  const savePreset = useCallback(
    (preset) => {
      change(
        (state) => {
          const index = state.presets.findIndex(
            (item) => item.id === preset.id,
          );
          if (index < 0) state.presets.push(preset);
          else state.presets[index] = preset;
        },
        ["presets"],
      );
      setNotice("Weekly preset saved.");
    },
    [change],
  );
  /** @brief Delete only the saved template; phase snapshots remain independent. */
  const removePreset = useCallback(
    (id) =>
      change(
        (state) => {
          state.presets = state.presets.filter((preset) => preset.id !== id);
        },
        ["presets"],
      ),
    [change],
  );
  /** @brief Start a semester draft from a subject-free template. */
  const buildFromPreset = useCallback((preset) => {
    setWizard({ mode: "create", phase: null, preset, key: uid() });
    setEditor(null);
  }, []);
  /** @brief Update a library subject immediately, leaving unrelated completion history untouched. */
  const saveLibrarySubject = useCallback(
    (subject) => change((state) => saveSubject(state, subject)),
    [change],
  );
  /** @brief Remove a subject in local memory immediately; disk persistence stays in the background. */
  const removeLibrarySubject = useCallback(
    (id) => {
      change((state) => deleteSubject(state, id));
      setEditor(null);
      setNotice("Subject removed from the library and its phases.");
    },
    [change],
  );

  useEffect(() => {
    if (!followToday || !activePhase) return;
    const current = getSchedulePosition(activePhase, new Date());
    const selected = current.event?.base || new Date();
    setSelectedDate((previous) =>
      previous === dateKey(selected) ? previous : dateKey(selected),
    );
  }, [followToday, activePhase?.id, dateKey(now), eventToken]);
  if (bootError)
    return (
      <div className="error-page">
        <h1>Could not start Study Orbit</h1>
        <p>{bootError}</p>
        <p>
          Check that <code>run.sh</code> started both the file API and Vite,
          then reload this page.
        </p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  if (!data)
    return <div className="loading-page">Loading your local study state…</div>;
  return (
    <>
      <Layout
        data={data}
        now={now}
        activePhase={activePhase}
        hoursDone={hoursDone}
        onPhase={switchPhase}
        onCreate={() => openWizard("create")}
        onEdit={() => openWizard("edit")}
        onDuplicate={() => openWizard("duplicate")}
        onDelete={deletePhase}
        onTheme={themeChange}
        onBackups={() => setBackupsOpen(true)}
        onSaveState={() =>
          saveStateBackup("create").catch((e) => setNotice(e.message))
        }
        saving={saving}
      >
        <nav className="workspace-nav" aria-label="Workspace sections">
          {[
            ["focus", "Focus"],
            ["presets", "Weekly presets"],
            ["subjects", "Subjects"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-current={view === id ? "page" : undefined}
              className={view === id ? "active" : ""}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className={`workspace-grid ${view === "focus" ? "is-focus" : ""}`}>
          <div className="workspace-page">
            {view === "presets" && (
              <PresetLibrary
                presets={data.presets}
                onSave={savePreset}
                onDelete={removePreset}
                onBuild={buildFromPreset}
              />
            )}
            {view === "subjects" && (
              <SubjectManager
                subjects={data.subjects}
                onSave={saveLibrarySubject}
                onDelete={removeLibrarySubject}
              />
            )}
            {view === "focus" && (
              <>
                {!activePhase ? (
                  <div className="empty-dashboard panel">
                    <div className="welcome-icon">
                      <CalendarPlus2 size={31} />
                    </div>
                    <span className="eyebrow">WELCOME TO STUDY ORBIT</span>
                    <h2>A plan built around your life.</h2>
                    <p>
                      Start with your available time, then choose your
                      semester’s subjects and priorities. Study Orbit adapts to
                      early mornings, late nights, and everything between.
                    </p>
                    <div className="welcome-actions">
                      <button
                        className="primary-button"
                        onClick={() => openWizard("create")}
                      >
                        <CalendarPlus2 size={17} /> Create your first phase{" "}
                        <ArrowRight size={16} />
                      </button>
                    </div>
                    <p className="welcome-caption">
                      <ShieldCheck size={14} /> Everything is stored only on
                      this computer.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="top-grid">
                      <DashboardWidget
                        phase={activePhase}
                        position={position}
                        now={now}
                        note={note}
                        onEdit={openEditor}
                      />
                      <NextBlock
                        phase={activePhase}
                        next={position.next}
                        handoffs={data.handoffs}
                        onEdit={openEditor}
                      />
                    </div>
                    <WeekCalendar phase={activePhase} />
                    <div className="content-grid">
                      <WeeklySchedule
                        phase={activePhase}
                        selectedDate={selectedDate}
                        onSelectDate={selectDate}
                        now={calendarToday}
                        status={calendarStatus}
                        progress={data.blocks}
                        onProgress={progressChange}
                        onEdit={openEditor}
                        optionalNote={data.notes[selectedDate] || ""}
                        onOptionalNote={optionalNoteChange}
                      />
                      <div className="side-stack">
                        <AllocationCard
                          phase={activePhase}
                          completed={allocationCompletion.bySubject}
                          weekStart={allocationWeek}
                        />
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
          <aside className="workspace-audio" aria-label="Focus music">
            <FocusShelf
              items={data.audioItems}
              onChange={(items) =>
                change(
                  (d) => {
                    d.audioItems = items;
                  },
                  ["audioItems"],
                )
              }
            />
          </aside>
        </div>
      </Layout>
      {wizard && (
        <PhasePlanner
          key={wizard.key}
          mode={wizard.mode}
          initialPhase={wizard.phase}
          library={data.subjects}
          presets={data.presets}
          initialPreset={wizard.preset}
          onSavePreset={savePreset}
          onSave={savePhase}
          onClose={() => setWizard(null)}
        />
      )}
      {backupsOpen && (
        <BackupManager
          onClose={() => setBackupsOpen(false)}
          onSave={saveStateBackup}
          onRestore={restoreBackup}
          onImport={importBackup}
          onExport={async () => {
            await flush();
            return dataRef.current;
          }}
        />
      )}
      {editor && !wizard && !backupsOpen && activePhase && (
        <NextStepModal
          editor={editor}
          subjectName={subjectName(activePhase, editor.subjectId)}
          text={data.handoffs[editor.subjectId]?.text || ""}
          onChange={editNextStep}
          onClose={closeEditor}
          now={now}
        />
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </>
  );
}
