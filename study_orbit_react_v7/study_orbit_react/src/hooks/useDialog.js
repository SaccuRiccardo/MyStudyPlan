import { useEffect, useRef } from "react";

/** @brief Keep keyboard focus inside a modal and return it to the previous control on close. */
export function useDialog(ref, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    if (!dialog) return;
    const controls = () =>
      [
        ...dialog.querySelectorAll(
          "button, input, select, textarea, a[href], [tabindex]",
        ),
      ].filter(
        (element) =>
          !element.disabled &&
          element.tabIndex >= 0 &&
          element.getClientRects().length,
      );
    controls()[0]?.focus();
    function handleKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const items = controls();
      const first = items[0],
        last = items.at(-1);
      if (!first) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    dialog.addEventListener("keydown", handleKey);
    return () => {
      dialog.removeEventListener("keydown", handleKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [ref]);
}
