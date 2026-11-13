/** @brief Read local API responses and surface actionable server failures. */
async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...options,
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error("The local file server is not responding correctly.");
  }
  if (!response.ok)
    throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}
export const api = {
  inspectSlidesFolder: (folderPath) => request("/slides/inspect", {
    method: "POST", body: JSON.stringify({ folderPath }),
  }),
  listSlides: (subjectId) => request(`/subjects/${encodeURIComponent(subjectId)}/slides`),
  slidesUrl: (subjectId, filePath) => `/api/subjects/${encodeURIComponent(subjectId)}/slides/file?path=${encodeURIComponent(filePath)}`,

  readState: () => request("/state"),
  writeState: (state) =>
    request("/state", { method: "PUT", body: JSON.stringify(state) }),
  listBackups: () => request("/backups"),
  createBackup: () =>
    request("/backups", {
      method: "POST",
      body: JSON.stringify({
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    }),
  restoreBackup: (name) =>
    request(`/backups/${encodeURIComponent(name)}/restore`, {
      method: "POST",
      body: "{}",
    }),
};
