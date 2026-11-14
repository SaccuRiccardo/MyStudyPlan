export const MIN_PDF_SCALE = 0.1;
export const MAX_PDF_SCALE = 10;
export const clampPdfScale = scale => Math.max(MIN_PDF_SCALE, Math.min(MAX_PDF_SCALE, scale));

export function parsePdfZoom(value, fallbackScale = 1) {
  const text = String(value ?? "").trim().replace(/%$/, "").trim().replace(",", ".");
  const number = text ? Number(text) : NaN;
  return Number.isFinite(number) ? clampPdfScale(number / 100) : fallbackScale;
}
export const pdfZoomPercent = scale => Math.round(scale * 10000) / 100;
export function wheelPdfScale(scale, deltaY, deltaMode = 0, height = 600) {
  if (!Number.isFinite(deltaY)) return scale;
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? height : 1);
  return clampPdfScale(scale * Math.exp(-Math.max(-240, Math.min(240, pixels)) / 500));
}

/** PDF.js expects its zoom origin relative to the scroll container's offset parent. */
export function setPdfScale(viewer, target, point = null) {
  const scale = clampPdfScale(target);
  if (point) {
    const element = viewer.container, rect = element.getBoundingClientRect();
    viewer.updateScale({ scaleFactor: scale / viewer.currentScale, drawingDelay: 100,
      origin: [point.x - rect.left + element.offsetLeft, point.y - rect.top + element.offsetTop] });
  } else viewer.currentScale = scale;
  return viewer.currentScale;
}

/** Handle PDF gestures locally so the surrounding application does not zoom. */
export function bindPdfZoom(element, { viewer, enabled, onZoom }) {
  let touch = null, safari = null, wheel = null;
  const listeners = [];
  const listen = (name, handler) => { element.addEventListener(name, handler, { passive: false }); listeners.push([name, handler]); };
  const apply = (scale, point) => { setPdfScale(viewer, scale, point); viewer.update(); onZoom(); };
  listen("wheel", event => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    if (!enabled() || !event.deltaY) return;
    const now = Date.now();
    if (!wheel || now - wheel.at > 250 || wheel.result !== viewer.currentScale)
      wheel = { target: viewer.currentScale };
    // Trackpad pinch emits tiny relative deltas. Accumulate them across PDF.js's
    // rounded scale updates so slow pinches still change the zoom.
    wheel.target = wheelPdfScale(wheel.target, event.deltaY, event.deltaMode, element.clientHeight);
    apply(wheel.target, { x: event.clientX, y: event.clientY });
    wheel.at = now; wheel.result = viewer.currentScale;
  });
  listen("keydown", event => {
    if (!(event.ctrlKey || event.metaKey) || event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (!["+", "=", "-", "0"].includes(event.key) || !enabled()) return;
    event.preventDefault(); event.stopPropagation();
    if (event.key === "0") viewer.currentScale = 1;
    else if (event.key === "-") viewer.decreaseScale();
    else viewer.increaseScale();
    viewer.update(); onZoom();
  });
  const points = event => {
    if (event.touches?.length !== 2) return null;
    const [a, b] = event.touches;
    return { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  };
  listen("touchstart", event => {
    const point = points(event);
    if (!point || point.distance <= 0 || !enabled()) { touch = null; return; }
    event.preventDefault(); touch = { ...point, scale: viewer.currentScale };
  });
  listen("touchmove", event => {
    const point = points(event);
    if (!touch || !point) return;
    event.preventDefault();
    if (!enabled()) { touch = null; return; }
    element.scrollLeft -= point.x - touch.x;
    element.scrollTop -= point.y - touch.y;
    apply(touch.scale * point.distance / touch.distance, point);
    touch.x = point.x; touch.y = point.y;
  });
  listen("touchend", event => { if (event.touches?.length !== 2) touch = null; });
  listen("touchcancel", () => { touch = null; });
  // Safari trackpad pinch events use gesturechange instead of Ctrl+wheel.
  listen("gesturestart", event => {
    if (touch || !enabled()) return;
    event.preventDefault(); safari = { scale: viewer.currentScale, start: event.scale || 1 };
  });
  listen("gesturechange", event => {
    if (!safari || touch || !enabled() || !Number.isFinite(event.scale) || event.scale <= 0) return;
    event.preventDefault();
    const rect = element.getBoundingClientRect();
    apply(safari.scale * event.scale / safari.start, {
      x: Number.isFinite(event.clientX) ? event.clientX : rect.left + rect.width / 2,
      y: Number.isFinite(event.clientY) ? event.clientY : rect.top + rect.height / 2,
    });
  });
  listen("gestureend", () => { safari = null; });
  return () => { for (const [name, handler] of listeners) element.removeEventListener(name, handler); touch = safari = null; };
}
