import { slideKey, readSelectedSlide, saveSelectedSlide } from "../lib/slidePositions.js";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen, ExternalLink, FileText, FolderOpen, Maximize2, Minimize2,
  Pause, Play, RefreshCw, RotateCcw, Search, SlidersHorizontal, Timer, Volume2, VolumeX,
} from "lucide-react";
import { api } from "../lib/api.js";

const PdfReader = lazy(() => import("./PdfReader.jsx"));

const clock = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
const intervalName = (mode) => mode === "focus" ? "Focus" : mode === "longBreak" ? "Long break" : "Short break";
const fileSize = (size) => size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;

/** Read PDFs from a subject's local folder while the shared Pomodoro remains visible. */
export default function SlidesReader({
  active = true, subjects = [], subjectId, onSelectSubject, onSaveFolder,
  timer, onStartTimer, ambience, onOpenPomodoro,
}) {
  const subject = subjects.find((item) => item.id === subjectId) || subjects[0];
  const activeId = subject?.id || null;
  const savedFolder = subject?.slidesFolder || "";
  const [folderPath, setFolderPath] = useState(savedFolder);
  const [listing, setListing] = useState(null);
  const [selectedPath, setSelectedPath] = useState("");
  const [listingRevision, setListingRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [viewerError, setViewerError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const wrapperRef = useRef(null);
  const currentSubject = useRef(activeId);
  currentSubject.current = activeId;
  const requestGeneration = useRef(0);
  const savingSubject = useRef(null);

  const applyListing = (result, id) => {
    setListing({ ...result, subjectId: id });
    setListingRevision((previous) => previous + 1);
    setSelectedPath((previous) => {
      const remembered = readSelectedSlide(slideKey(id, result.folderPath));
      return [remembered, previous].find((path) => result.files.some((file) => file.path === path)) || result.files[0]?.path || "";
    });
    setViewerError("");
  };

  async function refresh() {
    if (!activeId || !savedFolder) return;
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError("");
    try {
      const result = await api.listSlides(activeId);
      if (generation === requestGeneration.current && currentSubject.current === activeId)
        applyListing(result, activeId);
    } catch (failure) {
      if (generation === requestGeneration.current && currentSubject.current === activeId) {
        setError(failure.message || "Could not read this folder.");
        setListing(null);
        setSelectedPath("");
      }
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (savingSubject.current === activeId) return;
    setSaving(false);
    requestGeneration.current += 1;
    setFolderPath(savedFolder);
    setListing(null);
    setSelectedPath("");
    setSearch("");
    setError("");
    setViewerError("");
    setLoading(false);
    if (savedFolder) refresh();
    return () => { requestGeneration.current += 1; };
  }, [activeId, savedFolder]);

  useEffect(() => {
    const change = () => setExpanded(document.fullscreenElement === wrapperRef.current);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);

  useEffect(() => {
    if (!active && document.fullscreenElement === wrapperRef.current)
      document.exitFullscreen().catch(() => {});
  }, [active]);

  const files = listing?.subjectId === activeId ? listing.files : [];
  const visibleFiles = useMemo(() => files.filter((file) =>
    file.path.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [files, search]);
  const selected = files.find((file) => file.path === selectedPath);
  const pdfUrl = selected ? `${api.slidesUrl(activeId, selected.path)}&revision=${listingRevision}` : "";

  useEffect(() => {
    if (selected && listing?.folderPath) saveSelectedSlide(slideKey(activeId, listing.folderPath), selected.path);
  }, [activeId, listing?.folderPath, selected?.path]);

  async function saveFolder(event) {
    event.preventDefault();
    if (!activeId || !folderPath.trim()) return;
    requestGeneration.current += 1;
    const id = activeId;
    savingSubject.current = id;
    setSaving(true);
    setError("");
    try {
      const result = await onSaveFolder(id, folderPath.trim());
      if (currentSubject.current === id) {
        requestGeneration.current += 1;
        setLoading(false);
        applyListing(result, id);
        setFolderPath(result.folderPath);
      }
    } catch (failure) {
      if (currentSubject.current === id) setError(failure.message || "Could not save this folder.");
    } finally {
      if (savingSubject.current === id) savingSubject.current = null;
      if (currentSubject.current === id) setSaving(false);
    }
  }

  async function toggleExpanded() {
    try {
      if (document.fullscreenElement === wrapperRef.current) await document.exitFullscreen();
      else if (wrapperRef.current?.requestFullscreen) await wrapperRef.current.requestFullscreen();
      else setViewerError("Fullscreen is unavailable in this browser. The PDF stays open below.");
    } catch {
      setViewerError("Fullscreen could not open. You can still use the reader below.");
    }
  }

  if (!subject) return (
    <section className="panel section-panel slides-empty-library">
      <BookOpen size={28} />
      <h2>Slides reader</h2>
      <p>Add a subject in Subjects, then connect its slides folder here.</p>
    </section>
  );

  return (
    <section className="slides-page" aria-labelledby="slidesTitle">
      <div className="slides-heading">
        <div><span className="panel-overline">YOUR MATERIAL, YOUR RHYTHM</span><h2 id="slidesTitle">Slides reader</h2><p>Keep your slides and study timer together.</p></div>
        <label className="slides-subject-select">Subject<select aria-label="Slides subject" value={activeId} disabled={saving} onChange={(event) => {
          if (folderPath.trim() !== savedFolder && !window.confirm("Leave without saving this folder path?")) return;
          onSelectSubject(event.target.value);
        }}>{subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>

      <details className="panel slides-folder-settings" open={!savedFolder}>
        <summary><FolderOpen size={17} /><span>{savedFolder ? "Slides folder" : "Connect a slides folder"}</span>{savedFolder && <small title={savedFolder}>{savedFolder}</small>}</summary>
        <form onSubmit={saveFolder}>
          <label htmlFor="slidesFolderPath">Absolute folder path</label>
          <div className="slides-folder-input-row"><input id="slidesFolderPath" value={folderPath} disabled={saving} spellCheck={false} autoComplete="off" placeholder="Paste the full path to your slides folder" required onChange={(event) => setFolderPath(event.target.value)} /><button className="primary-button" type="submit" disabled={saving || !folderPath.trim()}><FolderOpen size={16} />{saving ? "Checking folder…" : "Save folder"}</button></div>
          <p>Use a folder on the computer running Study Orbit. For example, <code>/Users/you/Documents/Slides</code> on Mac or <code>C:\Users\You\Documents\Slides</code> on Windows. PDFs in subfolders appear too. Your files stay in their original folder.</p>
        </form>
      </details>
      {error && <p className="form-error" role="alert">{error}</p>}

      <div className={`panel slides-workspace ${expanded ? "is-expanded" : ""}`} ref={wrapperRef}>
        <div className="slides-timer-bar" aria-label="Reader timer controls">
          <div className="slides-timer-copy"><Timer size={18} /><span>{intervalName(timer.mode)}<strong role="timer" aria-label={`${intervalName(timer.mode)}: ${clock(timer.remainingSeconds)} remaining`}>{clock(timer.remainingSeconds)}</strong></span></div>
          <div className="slides-timer-actions">
            <button type="button" className="primary-button" onClick={() => {
              if (timer.running) { ambience.stopPreview(); timer.pause(); }
              else onStartTimer();
            }}>{timer.running ? <Pause size={16} /> : <Play size={16} />}{timer.running ? "Pause timer" : "Start timer"}</button>
            <button type="button" className="icon-button" aria-label="Reset reader timer" title="Reset interval" onClick={() => { ambience.stopPreview(); timer.reset(); }}><RotateCcw size={16} /></button>
            <button type="button" className="secondary-button" onClick={onOpenPomodoro}><SlidersHorizontal size={15} />Timer settings</button>
            <button type="button" className="icon-button" aria-label={ambience.playing ? "Pause reader background sound" : "Play reader background sound"} title={ambience.available === false ? "Choose a background sound in Pomodoro" : ambience.playing ? "Pause sound" : "Play sound"} disabled={ambience.available === false} onClick={ambience.toggle}>{ambience.playing ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
            <button type="button" className="icon-button" aria-label={expanded ? "Exit fullscreen reader" : "Expand reader"} title={expanded ? "Exit fullscreen" : "Expand reader"} onClick={toggleExpanded}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
          </div>
        </div>
        <div className="slides-reader-layout">
          <aside className="slides-file-sidebar" aria-label="PDF files">
            <div className="slides-files-heading"><strong><FileText size={16} /> PDFs <span>{files.length}</span></strong><button className="icon-button tiny" type="button" aria-label="Refresh PDF files" title="Find new or changed PDFs" disabled={loading || saving || !savedFolder} onClick={refresh}><RefreshCw size={15} className={loading ? "is-loading" : ""} /></button></div>
            <label className="slides-search"><Search size={15} /><input aria-label="Search PDFs" type="search" placeholder="Find a PDF…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <div className="slides-file-list" aria-busy={loading}>
              {loading ? <p className="slides-list-message" role="status">Reading your folder…</p> : visibleFiles.length ? visibleFiles.map((file) => (
                <button key={file.path} type="button" className={`slides-file ${file.path === selectedPath ? "selected" : ""}`} aria-pressed={file.path === selectedPath} title={file.path} onClick={() => { setSelectedPath(file.path); setViewerError(""); }}>
                  <FileText size={17} /><span><strong>{file.name}</strong><small>{file.path.includes("/") || file.path.includes("\\") ? file.path : fileSize(file.size)}</small></span>
                </button>
              )) : <p className="slides-list-message">{!savedFolder ? "Connect a folder above to see your PDFs." : search ? "No PDFs match your search." : "No PDFs found. Add slides to this folder, then refresh."}</p>}
            </div>
          </aside>
          <div className="slides-document">
            {selected ? <>
              <div className="slides-document-heading"><strong title={selected.path}>{selected.name}</strong><a className="text-button" href={pdfUrl} target="_blank" rel="noopener noreferrer">Open PDF in new tab <ExternalLink size={13} /></a></div>
              <Suspense fallback={<p className="slides-list-message">Loading the PDF reader…</p>}><PdfReader key={pdfUrl} url={pdfUrl} name={selected.name} active={active}
                positionKey={slideKey(activeId, listing.folderPath, selected.path)} /></Suspense>
              <p className="slides-viewer-hint">Your page, zoom and exact reading position save in this browser as you read. Use Open PDF in new tab for your browser’s print and download options.</p>
            </> : <div className="slides-document-empty"><BookOpen size={38} /><h3>{savedFolder ? "Your next topic awaits." : "Bring your slides into focus."}</h3><p>{savedFolder ? "Choose a PDF from the list to start reading." : "Save a subject's folder path above. Its PDFs will open here, with your timer always in view."}</p></div>}
          </div>
        </div>
        {listing?.warnings?.length > 0 && <div className="slides-list-warnings" role="status">{listing.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}
        {(viewerError || ambience.error) && <p className="form-error slides-reader-error" role="alert">{viewerError || ambience.error}</p>}
      </div>
    </section>
  );
}
