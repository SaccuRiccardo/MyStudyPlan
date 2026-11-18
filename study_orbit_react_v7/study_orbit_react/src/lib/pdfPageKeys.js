/** Reader-wide page keys, without taking arrows from editing or sidebar controls. */
export function bindPdfPageKeys(target, { viewer, enabled }) {
  const keydown = event => {
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
        !["ArrowLeft", "ArrowRight"].includes(event.key) || !enabled()) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="separator"], [role="slider"], .slides-file-sidebar')) return;
    event.preventDefault();
    const next = Math.max(1, Math.min(viewer.pagesCount, viewer.currentPageNumber + (event.key === "ArrowRight" ? 1 : -1)));
    if (next !== viewer.currentPageNumber) { viewer.currentPageNumber = next; viewer.update(); }
  };
  target.addEventListener("keydown", keydown);
  return () => target.removeEventListener("keydown", keydown);
}
