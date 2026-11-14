const PREFIX = "study-orbit:slides:v2:";
const finite = (value) => typeof value === "number" && Number.isFinite(value);
export const slideKey = (subjectId, folder, path = "") => JSON.stringify([subjectId, folder, path]);
export function validSlidePosition(position) {
  return !!position && Number.isInteger(position.page) && position.page >= 1 &&
    finite(position.scale) && position.scale >= 0.1 && position.scale <= 10 &&
    finite(position.left) && finite(position.top) && Math.abs(position.left) < 1000000 && Math.abs(position.top) < 1000000;
}
function read(key, storage) { try { return JSON.parse((storage || globalThis.localStorage).getItem(PREFIX + key)); } catch { return null; } }
function write(key, value, storage) { try { (storage || globalThis.localStorage).setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; } }
export function readSlidePosition(key, storage) {
  const position = read(`position:${key}`, storage);
  return validSlidePosition(position) ? position : null;
}
export function saveSlidePosition(key, position, storage) {
  return validSlidePosition(position) && write(`position:${key}`, position, storage);
}
export function readSelectedSlide(key, storage) {
  const value = read(`selected:${key}`, storage);
  return typeof value === "string" ? value : "";
}
export function saveSelectedSlide(key, path, storage) {
  return write(`selected:${key}`, path, storage);
}
