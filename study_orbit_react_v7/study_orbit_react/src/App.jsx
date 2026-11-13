import SlidesReader from "./components/SlidesReader.jsx";
import Pomodoro from "./components/Pomodoro.jsx";
import { usePomodoro } from "./hooks/usePomodoro.js";
import { usePomodoroAudio } from "./hooks/usePomodoroAudio.js";
import { DEFAULT_POMODORO, pomodoroSettingsError } from "./lib/pomodoro.js";
import { playSessionSound, unlockSessionAudio, SOUND_GRACE_MS } from "./lib/sessionSounds.js";
import PresetLibrary from "./components/PresetLibrary.jsx";
import { progressForWeek } from "./lib/progress.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus2, ArrowRight, ShieldCheck, Target, Timer, Library, BookOpen, Presentation } from "lucide-react";
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
import SubjectDiary from "./components/SubjectDiary.jsx";
import Settings from "./components/Settings.jsx";
import { useSessionSounds } from "./hooks/useSessionSounds.js";
import {
  journalEntriesForSubject,
  preserveJournalHistory,
  saveJournalEntry,
} from "./lib/studyJournal.js";
import PhasePlanner from "./components/PhasePlanner.jsx";
import BackupManager from "./components/BackupManager.jsx";
import { api } from "./lib/api.js";
import { clone, normalizeState, subjectName, uid } from "./lib/planner.js";
import { migrateExport } from "./lib/legacy.js";
import {
  dateKey,
  blockKey,
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
  const noteEditGroup = useRef(null);
  const goalEditGroups = useRef(new Map());
  const [diarySubjectId, setDiarySubjectId] = useState(null);
  const [slidesSubjectId, setSlidesSubjectId] = useState(null);
  const [diarySelection, setDiarySelection] = useState(null);
  const [diaryDirty, setDiaryDirty] = useState(false);
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
  useSessionSounds({ phase: activePhase, now, settings: data?.settings });
  const pomodoroPreferences = data?.settings.pomodoro || DEFAULT_POMODORO;
  const timer = usePomodoro({ ready: Boolean(data), preferences: pomodoroPreferences, onIntervalEnd: (event) => {
    if (!timer.audioArmed || !pomodoroPreferences.soundEnabled || Date.now() - event.completedAt > SOUND_GRACE_MS) return;
    playSessionSound(event.mode === "focus" ? "end" : "start", data?.settings).catch((error) => setNotice(error.message));
  } });
  const ambience = usePomodoroAudio({ running: timer.running, mode: timer.mode, preferences: pomodoroPreferences });
  const startPomodoroTimer = () => {
    if (pomodoroPreferences.soundEnabled) unlockSessionAudio().catch((error) => setNotice(error.message));
    ambience.arm();
    timer.start();
  };
  const updatePomodoroPreferences = (preferences) => {
    const error = pomodoroSettingsError(preferences);
    if (error) return error;
    change((d) => { d.settings.pomodoro = preferences; }, ["settings"]);
    setNotice("Pomodoro preferences saved.");
    return null;
  };
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
    if (!data || wizard || backupsOpen || view !== "focus") return;
    if (
      position.mode === "handoff" &&
      eventToken &&
      !dismissed.current.has(eventToken)
    ) {
      setEditor((old) =>
        old || {
                subjectId: activeSubjectId,
                source: "auto",
                token: eventToken,
                end: position.event.end.toISOString(),
                context: {
                  phaseId: activePhase.id,
                  date: dateKey(position.event.base),
                  slotId: position.event.slot.id,
                },
        },
      );
    }
  }, [
    data?.phase,
    position.mode,
    eventToken,
    activeSubjectId,
    position.event?.end?.getTime(),
    Boolean(wizard),
    backupsOpen,
    view,
  ]);

  /** @brief Open a manually editable next-step note for a subject. */
  const openEditor = useCallback((subjectId) => {
    const event = [position.event, position.next].find((item) => item?.slot.subjectId === subjectId);
    setEditor({ subjectId, source: "manual", context: {
      phaseId: activePhase?.id || null,
      date: event ? dateKey(event.base) : dateKey(new Date()),
      slotId: event?.slot.id || null,
    } });
  }, [activePhase?.id, eventToken, position.next?.start?.getTime()]);
  /** Group continuous typing into one saved diary version; every character still persists. */
  const editNextStep = (text) => {
    if (!editor) return;
    const state = dataRef.current;
    const phase = state.phases.find((p) => p.id === editor.context?.phaseId);
    const slot = phase?.slots.find((s) => s.id === editor.context?.slotId);
    const subject = state.subjects.find((s) => s.id === editor.subjectId);
    const context = {
      ...editor.context,
      id: editor.context?.slotId ? undefined : editor.token || `note:${editor.subjectId}:${editor.context?.date}`,
      subjectId: editor.subjectId,
      subjectName: subject?.name || "Subject",
      phaseName: phase?.name || "",
      start: slot?.start ?? null,
      end: slot?.end ?? null,
    };
    const key = slot ? blockKey(phase.id, parseDate(context.date), slot.id) : context.id;
    change((d) => {
      const entry = saveJournalEntry(d, context, { nextStep: text });
      if (noteEditGroup.current?.key === key && noteEditGroup.current?.editor === editor) {
        const baseline = noteEditGroup.current.baseline;
        if (entry.revisions.length > baseline + 1)
          entry.revisions = [...entry.revisions.slice(0, baseline), entry.revisions.at(-1)];
      } else noteEditGroup.current = { key, editor, baseline: entry.revisions.length - 1 };
    }, ["journal", "blocks", "handoffs"]);
  };
  const commitEditorNote = useCallback(() => { noteEditGroup.current = null; }, []);
  /** @brief Dismiss planning without losing autosaved text or reopening the same handoff. */
  const closeEditor = useCallback(() => {
    commitEditorNote();
    setEditor((old) => {
      if (old?.source === "auto") dismissed.current.add(old.token);
      return null;
    });
  }, [commitEditorNote]);
  /** Open the subject page at a dated occurrence, independently of the handoff timer. */
  const openDiary = useCallback((subjectId, detail = null) => {
    const state = dataRef.current;
    const phaseId = detail && Object.hasOwn(detail, "phaseId") ? detail.phaseId : state.phase;
    const phase = state.phases.find((p) => p.id === phaseId);
    const slot = phase?.slots.find((s) => s.id === detail?.slotId);
    const subject = state.subjects.find((s) => s.id === subjectId);
    const date = detail?.date || dateKey(new Date());
    const id = detail?.id || (slot ? blockKey(phase.id, parseDate(date), slot.id) : undefined);
    const record = id ? state.journal[id] || state.blocks[id] : null;
    const stored = record?.subjectId && record.subjectId !== subjectId ? null : record;
    setDiarySubjectId(subjectId);
    setDiarySelection({
      ...(stored || {}),
      ...(detail || {}),
      navigationKey: uid(),
      id,
      subjectId,
      subjectName: subject?.name || detail?.subjectName || stored?.subjectName || "Subject",
      phaseId: stored?.phaseId ?? phaseId ?? null,
      phaseName: stored?.phaseName ?? detail?.phaseName ?? phase?.name ?? "",
      date,
      slotId: detail?.slotId ?? null,
      start: stored?.start ?? detail?.start ?? slot?.start ?? null,
      end: stored?.end ?? detail?.end ?? slot?.end ?? null,
    });
    setView("diary");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const saveDiaryEntry = useCallback(async (context, patch) => {
    let result;
    change((d) => { result = saveJournalEntry(d, context, patch); }, ["journal", "blocks", "handoffs"]);
    try {
      await flush();
      setNotice("Study log saved locally.");
      return result;
    } catch (error) {
      setSaving("error");
      throw error;
    }
  }, [change, flush]);
  const canLeaveDiary = () => !diaryDirty || window.confirm("Leave this study log without saving your changes?");
  const navigateView = (id) => {
    if (id !== view && !canLeaveDiary()) return;
    if (id === "slides" && view !== "slides") setSlidesSubjectId((current) =>
      data.subjects.some((subject) => subject.id === current) ? current :
      data.subjects.some((subject) => subject.id === activeSubjectId) ? activeSubjectId : data.subjects[0]?.id || null);
    setView(id);
  };
  const openSlides = (subjectId = null) => {
    if (!canLeaveDiary()) return;
    setSlidesSubjectId(subjectId || activeSubjectId || data.subjects[0]?.id || null);
    setView("slides");
  };
  const saveSlidesFolder = async (subjectId, folderPath) => {
    const listing = await api.inspectSlidesFolder(folderPath);
    change((d) => {
      const subject = d.subjects.find((item) => item.id === subjectId);
      if (!subject) throw new Error("This subject was removed. Choose another subject.");
      subject.slidesFolder = listing.folderPath;
    }, ["subjects"]);
    try {
      await flush();
      setNotice("Slides folder saved locally.");
      return listing;
    } catch (error) { setSaving("error"); throw error; }
  };
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
    setDiarySelection(null);
    setDiarySubjectId(null);
    setView("focus");
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
    setDiarySelection(null);
    setDiarySubjectId(null);
    setView("focus");
    setNotice("Imported Study Orbit JSON file into Current_State/.");
  };
  /** @brief Activate a phase while resetting transient editors and day selection. */
  const switchPhase = (id) => {
    if (!canLeaveDiary()) return;
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
    if (!canLeaveDiary()) return;
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
      preserveJournalHistory(d);
      const previous = d.phases.find((p) => p.id === phase.id);
      for (const slot of phase.slots) {
        const old = previous?.slots.find((s) => s.id === slot.id);
        if (old && old.subjectId !== slot.subjectId) slot.id = uid();
      }
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
    }, ["subjects", "phases", "handoffs", "journal", "blocks"]);
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
      preserveJournalHistory(d);
      d.phases = d.phases.filter((p) => p.id !== activePhase.id);
      d.phase = d.phases[0]?.id || null;
    }, ["phases", "journal"]);
    setEditor(null);
  };
  /** @brief Update one dated block without affecting other weeks. */
  const progressChange = useCallback(
    (key, patch, record = true) =>
      change(
        (d) => {
          const phase = d.phases.find((p) => key.startsWith(`${p.id}:`));
          const slot = phase?.slots.find((s) => key.endsWith(`:${s.id}`));
          if (phase && slot) {
            const date = key.slice(phase.id.length + 1, -slot.id.length - 1);
            const entry = saveJournalEntry(d, {
              subjectId: slot.subjectId, subjectName: subjectName(phase, slot.subjectId),
              phaseId: phase.id, phaseName: phase.name, date, slotId: slot.id,
              start: slot.start, end: slot.end,
            }, patch);
            if (!record) {
              const baseline = goalEditGroups.current.get(key);
              if (baseline !== undefined && entry.revisions.length > baseline + 1)
                entry.revisions = [...entry.revisions.slice(0, baseline), entry.revisions.at(-1)];
              else if (baseline === undefined) goalEditGroups.current.set(key, entry.revisions.length - 1);
            } else goalEditGroups.current.delete(key);
          } else d.blocks[key] = { ...d.blocks[key], ...patch };
        },
        ["blocks", "journal", "handoffs"],
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
      change((state) => {
        preserveJournalHistory(state);
        deleteSubject(state, id);
      }, ["subjects", "phases", "handoffs", "journal"]);
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
  const diarySubjects = useMemo(() => {
    if (!data) return [];
    const subjects = new Map(data.subjects.map((s) => [s.id, s]));
    for (const entry of Object.values(data.journal))
      if (!subjects.has(entry.subjectId)) subjects.set(entry.subjectId, {
        id: entry.subjectId, name: `${entry.subjectName} (archived)`,
      });
    return [...subjects.values()];
  }, [data?.subjects, data?.journal]);
  const diarySubject = diarySubjects.find((s) => s.id === diarySubjectId) || diarySubjects[0];
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
        view={view}
        onNavigate={navigateView}
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
        saving={diaryDirty && saving !== "error" ? "draft" : saving}
      >
        <nav className="workspace-nav" aria-label="Workspace sections">
          {[
            ["focus", "Focus", Target],
            ["pomodoro", "Pomodoro", Timer],
            ["slides", "Slides", Presentation],
            ["subjects", "Subjects", Library],
            ["diary", "Study diary", BookOpen],
          ].map(([id, label, Icon]) => (
            <button
              key={id}
              aria-current={view === id ? "page" : undefined}
              className={view === id ? "active" : ""}
              onClick={() => navigateView(id)}
            >
              <Icon size={16} aria-hidden="true" /> {label}
            </button>
          ))}
        </nav>
        {view !== "pomodoro" && view !== "slides" && timer.running && <button className="pomodoro-running-banner" onClick={() => navigateView("pomodoro")}><Timer size={16} /> Pomodoro · {timer.mode === "focus" ? "Focus" : "Break"} · {String(Math.floor(timer.remainingSeconds / 60)).padStart(2, "0")}:{String(timer.remainingSeconds % 60).padStart(2, "0")} <span>Return to timer <ArrowRight size={14} /></span></button>}
        <div className={`workspace-grid ${view === "focus" ? "is-focus" : view === "slides" ? "is-reader" : ""}`}>
          <div className="workspace-page">
            {view === "slides" && <SlidesReader
              subjects={data.subjects}
              subjectId={slidesSubjectId || data.subjects[0]?.id}
              onSelectSubject={setSlidesSubjectId}
              onSaveFolder={saveSlidesFolder}
              timer={timer}
              onStartTimer={startPomodoroTimer}
              ambience={{ ...ambience, available: pomodoroPreferences.ambient !== "off" }}
              onOpenPomodoro={() => navigateView("pomodoro")}
            />}
            {view === "pomodoro" && <Pomodoro timer={timer} preferences={pomodoroPreferences} onPreferences={updatePomodoroPreferences} ambience={ambience} onStart={startPomodoroTimer}
              subject={position.mode === "study" ? subjectName(activePhase, position.event.slot.subjectId) : null}
              sessionEnd={position.mode === "study" ? position.event.end : null} />}
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
                onOpenDiary={openDiary}
                onOpenSlides={openSlides}
              />
            )}
            {view === "settings" && (
              <Settings settings={data.settings} onChange={(settings) =>
                change((d) => { d.settings = settings; }, ["settings"])
              } />
            )}
            {view === "diary" && (diarySubject ? (
              <SubjectDiary
                subject={diarySubject}
                subjects={diarySubjects}
                entries={journalEntriesForSubject(data, diarySubject.id)}
                handoff={data.handoffs[diarySubject.id]}
                selection={diarySelection?.subjectId === diarySubject.id ? diarySelection : null}
                phases={data.phases}
                onSelectSubject={(id) => openDiary(id)}
                onSelectEntry={(entry) => openDiary(entry.subjectId, entry)}
                onSaveEntry={saveDiaryEntry}
                onBack={() => setView("focus")}
                onDirtyChange={setDiaryDirty}
              />
            ) : (
              <section className="panel section-panel">
                <h2>Study diary</h2>
                <p>Add a subject to start recording your studying.</p>
                <button className="primary-button" onClick={() => setView("subjects")}>Open subjects</button>
              </section>
            ))}
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
                        onOpenSlides={openSlides}
                        onEdit={openEditor}
                      />
                      <NextBlock
                        phase={activePhase}
                        next={position.next}
                        handoffs={data.handoffs}
                        onEdit={openEditor}
                      />
                    </div>
                    <WeekCalendar phase={activePhase} selectedDate={selectedDate} onSelectDate={selectDate} onOpenSession={openDiary} />
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
                        onOpenSession={openDiary}
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
          onCommit={commitEditorNote}
          onDiary={() => {
            commitEditorNote();
            if (editor.source === "auto") dismissed.current.add(editor.token);
            openDiary(editor.subjectId, editor.context);
            setEditor(null);
          }}
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
