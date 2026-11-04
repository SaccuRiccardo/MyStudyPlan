import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureDependencies } from "../scripts/ensure-dependencies.mjs";

/** @brief Build a harmless incomplete installation fixture, with personal-file sentinels. */
async function fixture(versions = true) {
  const root = await mkdtemp(path.join(os.tmpdir(), "study-orbit-packages-"));
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "study-orbit-fixture", private: true }),
  );
  await writeFile(path.join(root, "package-lock.json"), "original lockfile\n");
  await mkdir(path.join(root, "Current_State"));
  await writeFile(
    path.join(root, "Current_State", "state.json"),
    "personal study state",
  );
  if (versions) await installedTools(root);
  return root;
}

/** @brief Supply tool metadata so tests can check version-matched repairs without executing Mac binaries. */
async function installedTools(root) {
  for (const [name, version] of [
    ["rollup", "4.60.0"],
    ["esbuild", "0.25.0"],
  ]) {
    await mkdir(path.join(root, "node_modules", name), { recursive: true });
    await writeFile(
      path.join(root, "node_modules", name, "package.json"),
      JSON.stringify({ name, version }),
    );
  }
}

/** @brief Prove repairs preserve application declarations, lockfiles and personal state. */
async function untouched(root) {
  assert.equal(
    await readFile(path.join(root, "package-lock.json"), "utf8"),
    "original lockfile\n",
  );
  assert.equal(
    await readFile(path.join(root, "Current_State", "state.json"), "utf8"),
    "personal study state",
  );
  assert.deepEqual(
    JSON.parse(await readFile(path.join(root, "package.json"), "utf8")),
    { name: "study-orbit-fixture", private: true },
  );
}

test("a working installation does not reinstall anything", () => {
  ensureDependencies({
    probe: () => true,
    install: () => assert.fail("Unexpected install"),
    log: () => {},
  });
});

test("missing Apple Silicon Rollup is repaired at its installed version without changing the lockfile", async () => {
  const root = await fixture();
  let repaired = false;
  const calls = [];
  try {
    ensureDependencies({
      root,
      platform: "darwin",
      arch: "arm64",
      probe: () => repaired,
      nativeProbe: (_, name) => name.startsWith("@esbuild/"),
      log: () => {},
      install: (cwd, args) => {
        assert.equal(cwd, root);
        calls.push(args);
        repaired = true;
      },
    });
    assert.equal(calls.length, 1);
    assert.ok(calls[0].includes("@rollup/rollup-darwin-arm64@4.60.0"));
    for (const flag of [
      "--no-save",
      "--package-lock=false",
      "--include=optional",
      "--include=dev",
    ])
      assert.ok(calls[0].includes(flag));
    assert.equal(
      calls[0].some((arg) => arg.startsWith("@esbuild/")),
      false,
    );
    await untouched(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Intel Mac repair installs both missing binaries together with matching versions", async () => {
  const root = await fixture();
  let repaired = false;
  const calls = [];
  try {
    ensureDependencies({
      root,
      platform: "darwin",
      arch: "x64",
      probe: () => repaired,
      nativeProbe: () => false,
      log: () => {},
      install: (_, args) => {
        calls.push(args);
        repaired = true;
      },
    });
    assert.equal(calls.length, 1);
    assert.ok(calls[0].includes("@rollup/rollup-darwin-x64@4.60.0"));
    assert.ok(calls[0].includes("@esbuild/darwin-x64@0.25.0"));
    await untouched(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an incomplete frozen install is followed by a targeted optional-package repair", async () => {
  const root = await fixture(false);
  const calls = [];
  let repaired = false;
  try {
    ensureDependencies({
      root,
      platform: "darwin",
      arch: "arm64",
      probe: () => repaired,
      nativeProbe: () => false,
      log: () => {},
      install: (_, args) => {
        calls.push(args);
        if (args[0] === "ci") {
          for (const [name, version] of [
            ["rollup", "4.60.0"],
            ["esbuild", "0.25.0"],
          ]) {
            mkdirSync(path.join(root, "node_modules", name), {
              recursive: true,
            });
            writeFileSync(
              path.join(root, "node_modules", name, "package.json"),
              JSON.stringify({ name, version }),
            );
          }
        } else repaired = true;
      },
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[0][0], "ci");
    assert.ok(calls[0].includes("--include=optional"));
    assert.ok(calls[1].includes("@rollup/rollup-darwin-arm64@4.60.0"));
    await untouched(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a package download failure stops setup and preserves personal files", async () => {
  const root = await fixture();
  try {
    assert.throws(
      () =>
        ensureDependencies({
          root,
          platform: "darwin",
          arch: "arm64",
          probe: () => false,
          nativeProbe: () => false,
          log: () => {},
          install: () => {
            throw new Error("download denied");
          },
        }),
      /download denied/,
    );
    await untouched(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
