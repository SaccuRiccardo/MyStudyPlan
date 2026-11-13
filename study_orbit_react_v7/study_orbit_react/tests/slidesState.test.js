import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { normalizeState } from "../src/lib/planner.js";
import { migrateExport } from "../src/lib/legacy.js";
import { saveSubject } from "../src/lib/subjects.js";
import { validateState } from "../server/storage.js";

const workspace = (slidesFolder) => normalizeState({
  subjects: [{ id: "math", name: "Mathematics", tier: "A", color: "#148b72", ...(slidesFolder === undefined ? {} : { slidesFolder }) }],
});

test("older subjects need no slides folder and configured paths remain portable across operating systems", () => {
  const old = workspace();
  assert.equal(old.subjects[0].slidesFolder, undefined);
  assert.equal(validateState(old), old);
  for (const folder of ["/Users/You/Study slides/Math", "C:\\Users\\You\\Documents\\Math slides", " /literal spaces "]) {
    const state = workspace(folder);
    const restored = normalizeState(migrateExport(JSON.parse(JSON.stringify(state))));
    assert.equal(restored.subjects[0].slidesFolder, folder);
    assert.equal(validateState(restored), restored, "Portable imports do not require folders to exist here");
    saveSubject(restored, { ...restored.subjects[0], name: "Advanced Mathematics" });
    assert.equal(restored.subjects[0].slidesFolder, folder, "Renaming does not lose folder configuration");
  }
});

test("malformed slide paths fail before normalization or import can discard them", () => {
  for (const value of [null, 15, {}, [], true]) {
    const invalid = workspace();
    invalid.subjects[0].slidesFolder = value;
    assert.throws(() => normalizeState(invalid), /slides folder path/);
    assert.throws(() => migrateExport(invalid), /slides folder path/);
    assert.throws(() => validateState(invalid), /slides folder path/);
  }
  const phaseOnly = workspace();
  phaseOnly.phase = "semester";
  phaseOnly.phases = [{ id: "semester", name: "Semester", subjects: [{ id: "math", name: "Mathematics", slidesFolder: 12 }], slots: [], targetHours: {} }];
  assert.throws(() => normalizeState(phaseOnly), /slides folder path/);
  assert.throws(() => migrateExport(phaseOnly), /slides folder path/);
  assert.throws(() => validateState(phaseOnly), /slides folder path/);
});

test("saved state and backups retain folder references without copying PDF contents", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "study-orbit-slides-state-"));
  const previousRoot = process.env.STUDY_ORBIT_DATA_ROOT;
  process.env.STUDY_ORBIT_DATA_ROOT = root;
  const storage = await import(`../server/storage.js?slides-state=${Date.now()}`);
  try {
    const state = workspace("C:\\Study\\Physics slides");
    await storage.putState(state);
    const backup = await storage.createBackup();
    await storage.putState(workspace());
    const restored = await storage.restoreBackup(backup.name);
    assert.equal(restored.subjects[0].slidesFolder, state.subjects[0].slidesFolder);
    const raw = await readFile(path.join(root, "Current_State", "state.json"), "utf8");
    assert.equal(JSON.parse(raw).subjects[0].slidesFolder, state.subjects[0].slidesFolder);
    assert.equal(raw.includes("%PDF"), false);
  } finally {
    if (previousRoot === undefined) delete process.env.STUDY_ORBIT_DATA_ROOT;
    else process.env.STUDY_ORBIT_DATA_ROOT = previousRoot;
    await rm(root, { recursive: true, force: true });
  }
});
