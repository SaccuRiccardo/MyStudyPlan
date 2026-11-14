import test from "node:test";
import assert from "node:assert/strict";
import { slideKey, readSlidePosition, saveSlidePosition, readSelectedSlide, saveSelectedSlide, validSlidePosition } from "../src/lib/slidePositions.js";
const memory = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; };
const position = { page: 6, scale: 0.4, left: -12.5, top: 418.25, windowY: 320 };
test("PDF page, exact anchor and zoom survive serialization independently for each folder and document", () => {
  const storage = memory();
  const a = slideKey("math", "/folder one", "lesson.pdf"), b = slideKey("math", "/folder two", "lesson.pdf");
  assert.equal(saveSlidePosition(a, position, storage), true);
  saveSlidePosition(b, { ...position, page: 2, scale: 1.75 }, storage);
  assert.deepEqual(readSlidePosition(a, storage), position);
  assert.equal(readSlidePosition(b, storage).page, 2);
  saveSelectedSlide(slideKey("math", "/folder one"), "week 2/lesson.pdf", storage);
  assert.equal(readSelectedSlide(slideKey("math", "/folder one"), storage), "week 2/lesson.pdf");
  assert.equal(readSelectedSlide(slideKey("physics", "/folder one"), storage), "");
});
test("corrupt bookmarks and disabled browser storage leave the reader usable", () => {
  for (const bad of [null, {}, { ...position, page: 0 }, { ...position, page: 2.5 }, { ...position, scale: Infinity }, { ...position, scale: 0 }, { ...position, left: NaN }, { ...position, top: "400" }]) assert.equal(validSlidePosition(bad), false);
  assert.equal(readSlidePosition("missing", memory()), null);
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("full"); } };
  assert.equal(readSlidePosition("a", blocked), null);
  assert.equal(saveSlidePosition("a", position, blocked), false);
  assert.equal(readSelectedSlide("a", blocked), "");
});
