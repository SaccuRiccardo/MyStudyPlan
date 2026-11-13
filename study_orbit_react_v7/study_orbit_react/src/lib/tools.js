/** Keep links portable and launch only ordinary web addresses. */
export function toolUrl(value) {
  const text = String(value || "").trim();
  const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`);
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error("Enter an HTTP or HTTPS website URL.");
  return url.href;
}
export function toolsError(value) {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return "Expected a tools library array.";
  const ids = new Set();
  for (const item of value) {
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.title !== "string" || !item.title.trim() || item.title.length > 150 || typeof item.category !== "string" || item.category.length > 50) return "Invalid tools library entry.";
    ids.add(item.id);
    try { if (toolUrl(item.url) !== item.url) return "Invalid tool URL."; for (const field of ["image", "icon"]) if (item[field] && toolUrl(item[field]) !== item[field]) return "Invalid tool preview URL."; } catch { return "Invalid tool URL."; }
    if (["image", "icon"].some((field) => item[field] !== undefined && typeof item[field] !== "string")) return "Invalid tool preview.";
  }
  return null;
}
export function reorderTool(tools, id, direction) {
  const index = tools.findIndex((item) => item.id === id), target = index + direction;
  if (index < 0 || target < 0 || target >= tools.length) return tools;
  const next = [...tools]; [next[index], next[target]] = [next[target], next[index]]; return next;
}
