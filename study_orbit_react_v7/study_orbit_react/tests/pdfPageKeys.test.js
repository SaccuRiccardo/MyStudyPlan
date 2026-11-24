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

test("Up and Down scroll the PDF in small steps without moving to a new slide", () => {
  const target = new EventTarget(), moves = [];
  target.closest = () => null;
  let enabled = true;
  const viewer = { currentPageNumber: 2, pagesCount: 3, container: { scrollBy: options => moves.push(options) } };
  const dispose = bindPdfPageKeys(target, { viewer, enabled: () => enabled });
  const key = (name, props = {}) => { const event = Object.assign(new Event("keydown", { cancelable: true }), { key: name, ...props }); target.dispatchEvent(event); return event; };
  assert.equal(key("ArrowDown").defaultPrevented, true);
  key("ArrowDown"); key("ArrowUp");
  assert.deepEqual(moves.map(move => move.top), [40, 40, -40]);
  assert.equal(viewer.currentPageNumber, 2);
  target.closest = () => ({}); assert.equal(key("ArrowDown").defaultPrevented, false);
  target.closest = () => null; assert.equal(key("ArrowUp", { shiftKey: true }).defaultPrevented, false);
  enabled = false; key("ArrowDown"); enabled = true;
  dispose(); assert.equal(key("ArrowDown").defaultPrevented, false);
  assert.equal(moves.length, 3);
});

test("Ctrl/Cmd+F opens PDF search even from a text field, only while the reader is active", () => {
  const target = new EventTarget();
  target.closest = () => ({});
  let enabled = true, finds = 0;
  const dispose = bindPdfPageKeys(target, { viewer: {}, enabled: () => enabled, onFind: () => finds++ });
  const key = (props = {}) => { const event = Object.assign(new Event("keydown", { cancelable: true }), { key: "f", ...props }); target.dispatchEvent(event); return event; };
  assert.equal(key({ ctrlKey: true }).defaultPrevented, true);
  assert.equal(key({ metaKey: true, key: "F" }).defaultPrevented, true);
  assert.equal(finds, 2);
  for (const props of [{}, { ctrlKey: true, altKey: true }, { ctrlKey: true, shiftKey: true }, { ctrlKey: true, isComposing: true }])
    assert.equal(key(props).defaultPrevented, false);
  enabled = false; assert.equal(key({ ctrlKey: true }).defaultPrevented, false); enabled = true;
  dispose(); assert.equal(key({ metaKey: true }).defaultPrevented, false);
  assert.equal(finds, 2);
});
