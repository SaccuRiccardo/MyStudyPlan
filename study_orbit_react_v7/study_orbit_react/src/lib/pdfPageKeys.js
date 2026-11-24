/** Reader shortcuts keep editing and sidebar arrow behavior intact. */
export function bindPdfPageKeys(target, { viewer, enabled, onFind }) {
  const keydown = event => {
    if (event.defaultPrevented || event.isComposing || !enabled()) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "f" && onFind) {
      event.preventDefault(); onFind(); return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="separator"], [role="slider"], .slides-file-sidebar')) return;
    event.preventDefault();
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      viewer.container.scrollBy({ top: event.key === "ArrowDown" ? 40 : -40, behavior: "instant" });
      return;
    }
    const next = Math.max(1, Math.min(viewer.pagesCount, viewer.currentPageNumber + (event.key === "ArrowRight" ? 1 : -1)));
    if (next !== viewer.currentPageNumber) { viewer.currentPageNumber = next; viewer.update(); }
  };
  target.addEventListener("keydown", keydown);
  return () => target.removeEventListener("keydown", keydown);
}
