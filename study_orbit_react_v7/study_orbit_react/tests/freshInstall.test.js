import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("first launch creates an empty workspace without example or personal data", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "study-orbit-fresh-"));
  try {
    const output = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import {getState,listBackups} from './server/storage.js'; console.log(JSON.stringify({state:await getState(),backups:await listBackups()}))`,
      ],
      {
        cwd: new URL("..", import.meta.url),
        env: { ...process.env, STUDY_ORBIT_DATA_ROOT: root },
        encoding: "utf8",
      },
    );
    const { state, backups } = JSON.parse(output);
    for (const key of ["subjects", "presets", "phases", "audioItems"])
      assert.deepEqual(state[key], []);
    for (const key of ["blocks", "notes", "handoffs"])
      assert.deepEqual(state[key], {});
    assert.equal(state.phase, null);
    assert.deepEqual(backups, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("tracked files exclude private state, snapshots, archives and exports", () => {
  const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  const privateFiles = files.filter((file) =>
    /(^|\/)(Current_State|Backups)\//.test(file)
      ? !file.endsWith("/.gitkeep")
      : /(^|\/)(\.env(?:\..*)?|study-orbit\.json)$|\.zip$|__\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_UTC/i.test(
          file,
        ),
  );
  assert.deepEqual(privateFiles, [], "Personal files must never be tracked");
});
