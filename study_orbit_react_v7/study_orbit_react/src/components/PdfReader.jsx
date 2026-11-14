import { bindPdfZoom, parsePdfZoom, pdfZoomPercent } from "../lib/pdfZoom.js";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist/build/pdf.mjs";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";
import { readSlidePosition, saveSlidePosition } from "../lib/slidePositions.js";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Cache the document while elsewhere in the app; save PDF coordinates rather than browser pixels. */
export default function PdfReader({ url, positionKey, active, name }) {
  const container = useRef(null), pages = useRef(null), current = useRef(null);
  const [loaded, setLoaded] = useState(null), [error, setError] = useState("");
  const [ready, setReady] = useState(false), [page, setPage] = useState(1), [scale, setScale] = useState(100);
  const [pageInput, setPageInput] = useState("1"), [zoomInput, setZoomInput] = useState("100");
  const [query, setQuery] = useState("");
  const last = useRef(null), restoring = useRef(true), activeRef = useRef(active);
  const pageDirty = useRef(false), zoomDirty = useRef(false);
  activeRef.current = active;

  useEffect(() => {
    let alive = true;
    setLoaded(null); setError(""); setReady(false); setQuery("");
    const task = pdfjs.getDocument({ url, cMapUrl: "/api/pdfjs-assets/cmaps/", cMapPacked: true,
      standardFontDataUrl: "/api/pdfjs-assets/standard_fonts/", wasmUrl: "/api/pdfjs-assets/wasm/",
      isEvalSupported: false, enableXfa: false });
    task.onPassword = () => { if (alive) setError("This PDF requires a password. Use Open PDF in new tab to unlock it in your browser."); };
    Promise.all([task.promise, import("pdfjs-dist/web/pdf_viewer.mjs")]).then(([pdf, module]) => {
      if (alive) setLoaded({ pdf, module });
    }).catch((failure) => { if (alive) setError(failure.message || "Could not load this PDF. Refresh the folder or open it in a new tab."); });
    return () => { alive = false; task.destroy().catch(() => {}); };
  }, [url]);

  useLayoutEffect(() => {
    if (!loaded) return;
    const { pdf, module: { PDFViewer, EventBus, PDFLinkService, PDFFindController } } = loaded;
    const controller = new AbortController(), bus = new EventBus();
    const linkService = new PDFLinkService({ eventBus: bus, externalLinkTarget: 2, externalLinkRel: "noopener noreferrer" });
    const find = new PDFFindController({ eventBus: bus, linkService });
    const viewer = new PDFViewer({ container: container.current, viewer: pages.current, eventBus: bus,
      linkService, findController: find, abortSignal: controller.signal, annotationEditorMode: -1,
      imageResourcesPath: "/api/pdfjs-assets/images/", maxCanvasPixels: 16777216 });
    linkService.setViewer(viewer);
    last.current = readSlidePosition(positionKey);
    let alive = true, timer, restoreVersion = 0;
    let windowY = window.scrollY;
    restoring.current = true;
    const persist = () => { if (last.current) saveSlidePosition(positionKey, last.current); };
    const outerScroll = () => {
      if (activeRef.current && !restoring.current && last.current) {
        windowY = window.scrollY; last.current = { ...last.current, windowY };
        clearTimeout(timer); timer = setTimeout(persist, 150);
      }
    };
    window.addEventListener("scroll", outerScroll, { passive: true });
    bus.on("updateviewarea", ({ location }) => {
      if (!alive || !activeRef.current || restoring.current || !container.current?.clientWidth || !container.current?.clientHeight) return;
      last.current = { page: location.pageNumber, scale: viewer.currentScale, left: location.left, top: location.top, windowY };
      setPage(viewer.currentPageNumber);
      if (!pageDirty.current) setPageInput(String(viewer.currentPageNumber));
      setScale(pdfZoomPercent(viewer.currentScale));
      if (!zoomDirty.current) setZoomInput(String(pdfZoomPercent(viewer.currentScale)));
      clearTimeout(timer); timer = setTimeout(persist, 150);
    });
    const restore = async () => {
      const version = ++restoreVersion;
      restoring.current = true; setReady(false);
      const saved = last.current;
      try {
        viewer.update();
        await viewer.pagesPromise;
        if (!alive || !activeRef.current || version !== restoreVersion) return;
        if (saved) {
          viewer.currentScale = saved.scale;
          viewer.scrollPageIntoView({ pageNumber: Math.min(pdf.numPages, saved.page),
            destArray: [null, { name: "XYZ" }, saved.left, saved.top, saved.scale], allowNegativeOffset: true });
        } else viewer.currentScaleValue = "page-width";
        requestAnimationFrame(() => {
          if (!alive || !activeRef.current || version !== restoreVersion) return;
          if (Number.isFinite(saved?.windowY)) { windowY = saved.windowY; window.scrollTo(0, windowY); }
          restoring.current = false; viewer.update(); setReady(true);
        });
      } catch (failure) { if (alive) setError(failure.message); }
    };
    const syncZoom = () => {
      zoomDirty.current = false;
      const percent = pdfZoomPercent(viewer.currentScale);
      setScale(percent); setZoomInput(String(percent));
    };
    const unbindZoom = bindPdfZoom(container.current, { viewer,
      enabled: () => alive && activeRef.current && !restoring.current, onZoom: syncZoom });
    current.current = { viewer, bus, restore, persist };
    bus.on("pagesinit", restore);
    viewer.setDocument(pdf); linkService.setDocument(pdf);
    return () => {
      alive = false; restoreVersion++; window.removeEventListener("scroll", outerScroll);
      clearTimeout(timer); persist(); unbindZoom(); current.current = null;
      viewer.setDocument(null); linkService.setDocument(null); controller.abort();
    };
  }, [loaded, positionKey]);

  useLayoutEffect(() => {
    if (active) current.current?.restore();
    else { restoring.current = true; current.current?.persist(); }
  }, [active]);

  const goToPage = (value) => {
    pageDirty.current = false;
    if (!ready || !current.current) return;
    const next = Math.max(1, Math.min(loaded.pdf.numPages, Number(value) || 1));
    current.current.viewer.currentPageNumber = next;
  };
  const zoom = (value) => {
    zoomDirty.current = false;
    if (!ready || !current.current) return;
    const viewer = current.current.viewer;
    viewer.currentScale = parsePdfZoom(value, viewer.currentScale);
    viewer.update();
    setScale(pdfZoomPercent(viewer.currentScale)); setZoomInput(String(pdfZoomPercent(viewer.currentScale)));
  };
  const stepZoom = (direction) => {
    if (!ready || !current.current) return;
    zoomDirty.current = false;
    const viewer = current.current.viewer;
    if (direction > 0) viewer.increaseScale(); else viewer.decreaseScale();
    viewer.update();
    setScale(pdfZoomPercent(viewer.currentScale)); setZoomInput(String(pdfZoomPercent(viewer.currentScale)));
  };
  const search = (value, again = false) => {
    setQuery(value);
    current.current?.bus.dispatch("find", { source: window, type: again ? "again" : "", query: value,
      phraseSearch: true, caseSensitive: false, entireWord: false, highlightAll: true, findPrevious: false });
  };
  return <div className="pdf-reader" aria-label={`PDF slides: ${name}`}>
    <div className="pdf-controls">
      <button type="button" className="secondary-button" aria-label="Previous PDF page" disabled={!ready || page <= 1} onClick={() => goToPage(page - 1)}>‹</button>
      <label>Page <input aria-label="PDF page number" type="number" min="1" max={loaded?.pdf.numPages || 1} value={pageInput} disabled={!ready}
        onChange={(event) => { pageDirty.current = true; setPageInput(event.target.value); }} onBlur={() => { if (pageDirty.current) goToPage(pageInput); }} onKeyDown={(event) => { if (event.key === "Enter") goToPage(pageInput); }} /></label>
      <span>of {loaded?.pdf.numPages || "…"}</span>
      <button type="button" className="secondary-button" aria-label="Next PDF page" disabled={!ready || page >= loaded?.pdf.numPages} onClick={() => goToPage(page + 1)}>›</button>
      <div className="pdf-zoom-controls" role="group" aria-label="PDF zoom controls">
        <button type="button" className="secondary-button" aria-label="Zoom out PDF" title="Zoom out" disabled={!ready || scale <= 10} onClick={() => stepZoom(-1)}>−</button>
        <label>Zoom <input aria-label="PDF zoom percentage" title="Enter a percentage, then press Enter or Apply" type="number" step="any" min="10" max="1000" value={zoomInput} disabled={!ready}
          onFocus={event => event.target.select()}
          onChange={(event) => { zoomDirty.current = true; setZoomInput(event.target.value); }} onBlur={() => { if (zoomDirty.current) zoom(zoomInput); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); zoom(zoomInput); } }} />%</label>
        <button type="button" className="secondary-button" aria-label="Zoom in PDF" title="Zoom in" disabled={!ready || scale >= 1000} onClick={() => stepZoom(1)}>+</button>
        <button type="button" className="secondary-button" aria-label="Apply PDF zoom" disabled={!ready} onClick={() => zoom(zoomInput)}>Apply</button>
      </div>
      <button type="button" className="secondary-button" disabled={!ready} onClick={() => { current.current.viewer.currentScaleValue = "page-width"; }}>Fit width</button>
      <label className="pdf-find">Find <input aria-label="Find in PDF" type="search" disabled={!ready} value={query} placeholder="Find a word…" onChange={(event) => search(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") search(query, true); }} /></label>
    </div>
    <div className="pdf-canvas-area">
      <div ref={container} className="pdf-scroll-container" tabIndex={0} aria-label="PDF pages" data-ready={ready}>
        <div ref={pages} className="pdfViewer" />
      </div>
      {(!ready || error) && active && <div className="pdf-loading" role={error ? "alert" : "status"}>{error || "Opening your PDF at the saved reading position…"}</div>}
    </div>
  </div>;
}
