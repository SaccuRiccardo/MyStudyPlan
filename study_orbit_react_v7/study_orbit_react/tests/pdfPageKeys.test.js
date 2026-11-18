import test from "node:test";
import assert from "node:assert/strict";
import { bindPdfPageKeys } from "../src/lib/pdfPageKeys.js";

test("reader page keys respect bounds, modifiers, editing controls, inactive views and cleanup", () => {
  const target = new EventTarget();
  target.closest = () => null;
  let enabled = true;
  const viewer = { currentPageNumber: 1, pagesCount: 3, update() {} };
  const dispose = bindPdfPageKeys(target, { viewer, enabled: () => enabled });
  const key = (name, props = {}) => { const event = Object.assign(new Event("keydown", { cancelable: true }), { key: name, ...props }); target.dispatchEvent(event); return event; };
  key("ArrowLeft"); assert.equal(viewer.currentPageNumber, 1);
  key("ArrowRight"); key("ArrowRight"); key("ArrowRight"); assert.equal(viewer.currentPageNumber, 3);
  key("ArrowLeft"); assert.equal(viewer.currentPageNumber, 2);
  for (const modifier of ["ctrlKey", "metaKey", "altKey", "shiftKey", "isComposing"]) assert.equal(key("ArrowRight", { [modifier]: true }).defaultPrevented, false);
  assert.equal(viewer.currentPageNumber, 2);
  target.closest = () => ({}); assert.equal(key("ArrowRight").defaultPrevented, false); assert.equal(viewer.currentPageNumber, 2);
  target.closest = () => null; enabled = false; key("ArrowRight"); assert.equal(viewer.currentPageNumber, 2);
  enabled = true; dispose(); assert.equal(key("ArrowRight").defaultPrevented, false); assert.equal(viewer.currentPageNumber, 2);
});
