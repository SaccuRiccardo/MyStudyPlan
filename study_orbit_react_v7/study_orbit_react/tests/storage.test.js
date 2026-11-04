import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, rename } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Isolate tests from Current_State/ in the packaged application.
const root = await mkdtemp(path.join(os.tmpdir(), "study-orbit-test-"));
process.env.STUDY_ORBIT_DATA_ROOT = root;
const storage = await import("../server/storage.js");

const state = (theme) => ({
  version: 7,
  theme,
  phases: [],
  phase: null,
  blocks: {},
  notes: {},
  handoffs: {},
  audioItems: [],
});

test("file service writes JSON and restores whole directories", async () => {
  try {
    await storage.ensureStorage();
    await storage.putState(state("light"));
    const extraFile = path.join(storage.STATE_DIR, "extra.txt");
    await writeFile(extraFile, "an extra local note");
    const { name } = await storage.createBackup();
    assert.match(
      name,
      /^Workspace__\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_UTC[+-]\d{2}-\d{2}__[a-f0-9]{8}$/,
    );
    assert.ok((await storage.listBackups()).some((s) => s.name === name));
    await storage.putState(state("dark"));
    await rm(extraFile);
    await storage.restoreBackup(name);
    assert.equal((await storage.getState()).theme, "light");
    assert.equal(await readFile(extraFile, "utf8"), "an extra local note");
    await assert.rejects(
      () => storage.restoreBackup("../etc/passwd"),
      /Invalid backup name/,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("concurrent saves, snapshots and restores serialize; corrupt snapshots leave state intact", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "study-orbit-queue-"));
  process.env.STUDY_ORBIT_DATA_ROOT = folder;
  const isolated = await import("../server/storage.js?queue-regression");
  try {
    const saving = isolated.putState(state("dark"));
    const backup = isolated.createBackup();
    const laterSave = isolated.putState(state("light"));
    const [, snapshot] = await Promise.all([saving, backup, laterSave]);
    const restoring = isolated.restoreBackup(snapshot.name);
    const reading = isolated.getState();
    await restoring;
    assert.equal((await reading).theme, "dark");
    await writeFile(
      path.join(isolated.BACKUP_DIR, snapshot.name, "state.json"),
      "{broken",
    );
    await assert.rejects(isolated.restoreBackup(snapshot.name), SyntaxError);
    assert.equal((await isolated.getState()).theme, "dark");
    await assert.rejects(
      isolated.putState({ ...state("light"), phases: [{ id: "bad" }] }),
      /Invalid phase/,
    );
    assert.equal((await isolated.getState()).theme, "dark");
    await isolated.putState(state("light"));
    assert.equal((await isolated.getState()).theme, "light");
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("phase names and local times are used; old backups remain restorable", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "study-orbit-readable-"));
  process.env.STUDY_ORBIT_DATA_ROOT = folder;
  const isolated = await import("../server/storage.js?readable-names");
  try {
    const plan = {
      ...state("light"),
      phase: "exams",
      phases: [
        {
          id: "exams",
          name: "Winter / exams",
          subjects: [],
          targetHours: {},
          slots: [],
        },
      ],
    };
    await isolated.putState(plan);
    const first = await isolated.createBackup("Europe/Rome");
    assert.match(first.name, /^Winter - exams__/);
    const second = await isolated.createBackup("Europe/Rome");
    assert.notEqual(first.name, second.name);
    const legacy = "State_20261103T172530123Z_07eaf551";
    await rename(
      path.join(isolated.BACKUP_DIR, first.name),
      path.join(isolated.BACKUP_DIR, legacy),
    );
    assert.ok(
      (await isolated.listBackups()).some((item) => item.name === legacy),
    );
    await isolated.putState(state("dark"));
    assert.deepEqual(await isolated.restoreBackup(legacy), plan);
    assert.deepEqual(await isolated.restoreBackup(second.name), plan);
    await assert.rejects(
      isolated.createBackup("Invalid/Timezone"),
      /Invalid backup timezone/,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
