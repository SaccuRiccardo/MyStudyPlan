import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import { listSlidesFolder, resolveSlidePdf, registerSlidesRoutes } from "../server/slides.js";

const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "study-orbit-slides-"));
  const folder = path.join(root, "My slides");
  await mkdir(path.join(folder, "Week 2"), { recursive: true });
  await writeFile(path.join(folder, "Lecture 10.pdf"), pdf);
  await writeFile(path.join(folder, "Lecture 2.PDF"), pdf);
  await writeFile(path.join(folder, "Week 2", "Résumé #1.pdf"), pdf);
  await writeFile(path.join(folder, "notes.txt"), "private notes");
  await writeFile(path.join(folder, "not-really.pdf"), "not a PDF");
  await writeFile(path.join(root, "outside.pdf"), pdf);
  return { root, folder };
}

test("slides listing includes real PDFs, natural order and nested folders without copying them", async () => {
  const { root, folder } = await fixture();
  try {
    const result = await listSlidesFolder(folder);
    assert.equal(result.folderPath, folder);
    assert.deepEqual(result.files.map((file) => file.path), ["Lecture 2.PDF", "Lecture 10.pdf", "Week 2/Résumé #1.pdf"]);
    assert.ok(result.files.every((file) => file.size === pdf.length && Number.isFinite(Date.parse(file.modifiedAt))));
    assert.ok(result.warnings.some((warning) => warning.includes("not-really.pdf")));
    assert.equal(await resolveSlidePdf(folder, "Week 2/Résumé #1.pdf"), path.join(folder, "Week 2", "Résumé #1.pdf"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("slides paths reject traversal, absolute files, wrong types, and missing folders", async () => {
  const { root, folder } = await fixture();
  try {
    for (const name of ["../outside.pdf", "Week 2/../../outside.pdf", path.join(root, "outside.pdf"), "C:\\outside.pdf", "notes.txt", "not-really.pdf", "./Lecture 10.pdf", "Week 2\\Résumé #1.pdf", "Lecture\0.pdf"])
      await assert.rejects(resolveSlidePdf(folder, name), /PDF|folder/);
    await assert.rejects(listSlidesFolder("relative/slides"), /absolute/);
    await assert.rejects(listSlidesFolder(path.join(root, "missing")), /not found/);
    await assert.rejects(listSlidesFolder(path.join(folder, "Lecture 10.pdf")), /folder, not a file/);
    await assert.rejects(resolveSlidePdf(folder, "moved.pdf"), /moved or removed/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("linked files and directories cannot escape the selected folder", async () => {
  const { root, folder } = await fixture();
  try {
    await symlink(path.join(root, "outside.pdf"), path.join(folder, "linked.pdf"));
    await symlink(root, path.join(folder, "linked-folder"), "dir");
    // Links inside the root are excluded too; clients receive predictable ordinary files only.
    await symlink(path.join(folder, "Lecture 10.pdf"), path.join(folder, "inside-link.pdf"));
    const result = await listSlidesFolder(folder);
    assert.equal(result.files.length, 3);
    for (const name of ["linked.pdf", "linked-folder/outside.pdf", "inside-link.pdf"])
      await assert.rejects(resolveSlidePdf(folder, name), /Symbolic links/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("PDF HTTP routes stream inline ranges and reject cross-site and encoded traversal requests", async () => {
  const { root, folder } = await fixture();
  const app = express();
  app.use(express.json());
  registerSlidesRoutes(app, { getState: async () => ({ subjects: [{ id: "math", slidesFolder: folder }, { id: "unset" }] }) });
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ error: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const listed = await fetch(`${base}/api/subjects/math/slides`);
    assert.equal(listed.status, 200);
    assert.equal((await listed.json()).files.length, 3);
    const route = `${base}/api/subjects/math/slides/file?path=${encodeURIComponent("Week 2/Résumé #1.pdf")}`;
    const response = await fetch(route, { headers: { Range: "bytes=0-4" } });
    assert.equal(response.status, 206);
    assert.equal(await response.text(), "%PDF-");
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
    assert.match(response.headers.get("content-disposition"), /^inline;/);
    assert.match(response.headers.get("content-range"), /^bytes 0-4\//);
    const traversal = await fetch(`${base}/api/subjects/math/slides/file?path=%2e%2e%2foutside.pdf`);
    assert.equal(traversal.status, 400);
    const crossSite = await fetch(route, { headers: { "Sec-Fetch-Site": "cross-site" } });
    assert.equal(crossSite.status, 403);
    assert.equal((await fetch(`${base}/api/subjects/missing/slides`)).status, 404);
    assert.equal((await fetch(`${base}/api/subjects/unset/slides`)).status, 404);
    const inspected = await fetch(`${base}/api/slides/inspect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folderPath: folder }) });
    assert.equal(inspected.status, 200);
    assert.equal((await inspected.json()).folderPath, folder);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
