import { lstat, open, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

const MAX_FILES = 5000;
const MAX_DIRECTORIES = 2000;
const failure = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const contained = (root, target) => {
  const relative = path.relative(root, target);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

async function folderRoot(folderPath) {
  if (typeof folderPath !== "string" || !folderPath.trim() || !path.isAbsolute(folderPath) || folderPath.includes("\0"))
    throw failure("Enter the absolute path to an existing slides folder on this computer.");
  try {
    const root = await realpath(folderPath);
    if (!(await stat(root)).isDirectory()) throw failure("The slides path must point to a folder, not a file.");
    return root;
  } catch (error) {
    if (error.statusCode) throw error;
    if (error.code === "ENOENT" || error.code === "ENOTDIR") throw failure("Slides folder not found. Check its absolute path or reconnect the drive.", 404);
    if (error.code === "EACCES" || error.code === "EPERM") throw failure("Cannot read this slides folder. Give the app permission to read it.", 403);
    throw failure("Could not open this slides folder. Check the path and folder permissions.");
  }
}

async function isPdf(filePath) {
  const handle = await open(filePath, "r");
  try {
    const header = Buffer.alloc(5);
    const { bytesRead } = await handle.read(header, 0, 5, 0);
    return bytesRead === 5 && header.toString("ascii") === "%PDF-";
  } finally { await handle.close(); }
}

/** List local PDFs without following links out of the selected directory. */
export async function listSlidesFolder(folderPath) {
  const root = await folderRoot(folderPath);
  const files = [];
  const warnings = [];
  const warn = (message) => { if (warnings.length < 50) warnings.push(message); };
  const queue = [root];
  let directories = 0;
  while (queue.length && files.length < MAX_FILES && directories < MAX_DIRECTORIES) {
    const directory = queue.shift();
    directories++;
    let children;
    try { children = await readdir(directory, { withFileTypes: true }); }
    catch (error) {
      if (directory === root) throw failure("Cannot read this slides folder. Check its permissions.", 403);
      warn(`Could not read subfolder: ${path.relative(root, directory)}`);
      continue;
    }
    children.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    for (const child of children) {
      if (files.length >= MAX_FILES) break;
      const candidate = path.join(directory, child.name);
      const relative = path.relative(root, candidate).split(path.sep).join("/");
      // Recheck the path because a linked directory can change between reads.
      try {
        const info = await lstat(candidate);
        if (info.isSymbolicLink()) { warn(`Skipped symbolic link: ${relative}`); continue; }
        const actual = await realpath(candidate);
        if (!contained(root, actual)) { warn(`Skipped a file outside the slides folder: ${relative}`); continue; }
        if (info.isDirectory()) {
          if (queue.length + directories < MAX_DIRECTORIES) queue.push(candidate);
          else warn("Folder limit reached. Choose a more specific slides folder to see additional PDFs.");
        } else if (info.isFile() && /\.pdf$/i.test(child.name)) {
          if (!(await isPdf(actual))) { warn(`Skipped an invalid PDF: ${relative}`); continue; }
          files.push({ name: child.name, path: relative, size: info.size, modifiedAt: info.mtime.toISOString() });
        }
      } catch { warn(`Could not read: ${relative}`); }
    }
  }
  if (files.length >= MAX_FILES) warn("PDF limit reached (5,000 files). Choose a more specific folder to see additional PDFs.");
  files.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" }));
  return { folderPath: root, files, warnings };
}

/** Resolve a listed relative PDF and reject traversal, symlinks, and other file types. */
export async function resolveSlidePdf(folderPath, relativePath) {
  if (typeof relativePath !== "string" || !relativePath || relativePath.includes("\0") || relativePath.includes("\\") ||
      path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath) ||
      relativePath.split("/").some((part) => part === ".." || part === "." || !part) || !/\.pdf$/i.test(relativePath))
    throw failure("Choose a PDF inside the configured slides folder.");
  const root = await folderRoot(folderPath);
  const target = path.resolve(root, relativePath);
  if (!contained(root, target)) throw failure("The PDF must be inside the configured slides folder.", 403);
  try {
    let cursor = root;
    for (const component of relativePath.split("/")) {
      cursor = path.join(cursor, component);
      if ((await lstat(cursor)).isSymbolicLink()) throw failure("Symbolic links cannot be opened as slides.", 403);
    }
    const actual = await realpath(target);
    if (!contained(root, actual)) throw failure("The PDF must be inside the configured slides folder.", 403);
    if (!(await stat(actual)).isFile() || !(await isPdf(actual))) throw failure("This file is not a valid PDF.");
    return actual;
  } catch (error) {
    if (error.statusCode) throw error;
    if (error.code === "ENOENT" || error.code === "ENOTDIR") throw failure("This PDF was moved or removed. Refresh the slides list.", 404);
    if (error.code === "EACCES" || error.code === "EPERM") throw failure("Cannot read this PDF. Check its file permissions.", 403);
    throw failure("Could not open this PDF. Refresh the slides list and try again.");
  }
}

/** Keep local documents on the app's own origin, including Vite's API proxy. */
function localSlidesOnly(req, res, next) {
  if (req.get("Sec-Fetch-Site") === "cross-site") return res.status(403).json({ error: "Open slides from within Study Orbit." });
  res.set({ "Cross-Origin-Resource-Policy": "same-origin", "Referrer-Policy": "no-referrer", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  next();
}

export function registerSlidesRoutes(app, { getState }) {
  const subjectFolder = async (subjectId) => {
    const state = await getState();
    const subject = state.subjects?.find((item) => item.id === subjectId);
    if (!subject) throw failure("Subject not found.", 404);
    if (!subject.slidesFolder) throw failure("Set a slides folder for this subject first.", 404);
    return subject.slidesFolder;
  };
  app.post("/api/slides/inspect", localSlidesOnly, async (req, res) => res.json(await listSlidesFolder(req.body?.folderPath)));
  app.get("/api/subjects/:subjectId/slides", localSlidesOnly, async (req, res) => res.json(await listSlidesFolder(await subjectFolder(req.params.subjectId))));
  app.get("/api/subjects/:subjectId/slides/file", localSlidesOnly, async (req, res, next) => {
    const file = await resolveSlidePdf(await subjectFolder(req.params.subjectId), req.query.path);
    res.type("application/pdf");
    res.set("Content-Disposition", `inline; filename="slides.pdf"; filename*=UTF-8''${encodeURIComponent(path.basename(file)).replace(/['()*]/g, (value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`)}`);
    res.sendFile(file, { dotfiles: "allow", cacheControl: false }, (error) => { if (error) next(error); });
  });
}
