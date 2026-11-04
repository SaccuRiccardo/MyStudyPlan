import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const APP_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const NPM_FLAGS = [
  "--include=dev",
  "--include=optional",
  "--no-audit",
  "--no-fund",
];

/** @brief Test actual imports and an esbuild transform in a fresh process, avoiding cached import failures. */
export function checkDependencies(root, report = false) {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    for (const name of ['express','react','react-dom','lucide-react','@vitejs/plugin-react','vite']) await import(name);
    const esbuild = await import('esbuild');
    esbuild.transformSync('const answer = 42', { loader: 'js' });
  `,
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (report && result.status !== 0 && result.stderr)
    console.error(result.stderr.trim());
  return (
    result.status === 0 && existsSync(path.join(root, "node_modules/.bin/vite"))
  );
}

/** @brief Load a platform package to catch missing or incompatible native binaries. */
function checkNativePackage(root, name) {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      name.startsWith("@esbuild/")
        ? "require('esbuild').transformSync('const answer = 42', { loader: 'js' })"
        : "require(process.argv[1])",
      name,
    ],
    { cwd: root, encoding: "utf8" },
  );
  return result.status === 0;
}

/** @brief Read installed versions so native repairs match the tools already in this project. */
function installedVersion(root, name) {
  try {
    const require = createRequire(path.join(root, "package.json"));
    const file = require.resolve(`${name}/package.json`);
    return JSON.parse(readFileSync(file, "utf8")).version;
  } catch {
    return null;
  }
}

/** @brief Install with normal npm integrity/TLS checks; never remove state, manifests, or lockfiles. */
function installPackages(root, args) {
  // npm is a .cmd shim on Windows; invoke it through the command processor.
  const result =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", "npm", ...args], {
          cwd: root,
          stdio: "inherit",
        })
      : spawnSync("npm", args, { cwd: root, stdio: "inherit" });
  if (result.error || result.status !== 0)
    throw new Error(
      "Package download failed. Check the internet connection, then launch Study Orbit again.",
    );
}

/** @brief Repair incomplete installations, including npm's missing Apple Silicon/Intel optional dependencies. */
export function ensureDependencies({
  root = APP_DIR,
  platform = process.platform,
  arch = process.arch,
  probe = checkDependencies,
  nativeProbe = checkNativePackage,
  install = installPackages,
  log = console.log,
} = {}) {
  if (probe(root)) return;

  // npm can leave complete-looking folders while omitting Rollup's Mac binary (npm issue #4828).
  // Repair that exact version without regenerating a user's lockfile or changing package.json.
  const repairNative = () => {
    if (platform !== "darwin" || !["arm64", "x64"].includes(arch)) return false;
    const specs = [];
    for (const [tool, name] of [
      ["rollup", `@rollup/rollup-darwin-${arch}`],
      ["esbuild", `@esbuild/darwin-${arch}`],
    ]) {
      const version = installedVersion(root, tool);
      if (version && !nativeProbe(root, name)) specs.push(`${name}@${version}`);
    }
    if (!specs.length) return false;
    log(
      "Repairing missing Mac packages. Your study plans and backups are kept.",
    );
    install(root, [
      "install",
      "--no-save",
      "--package-lock=false",
      ...NPM_FLAGS,
      ...specs,
    ]);
    return true;
  };

  if (repairNative() && probe(root)) return;
  log(
    "Installing or repairing Study Orbit packages. This needs an internet connection.",
  );
  install(root, [
    existsSync(path.join(root, "package-lock.json")) ? "ci" : "install",
    ...NPM_FLAGS,
  ]);
  if (probe(root)) return;
  // Even a frozen install may omit a native package when its lockfile was created on another platform.
  if (repairNative() && probe(root)) return;
  probe(root, true);
  throw new Error(
    "The required packages still could not load. Keep the installation messages above for help; your study data has not been removed.",
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    ensureDependencies();
  } catch (error) {
    console.error(
      `Study Orbit could not prepare its packages: ${error.message}`,
    );
    process.exitCode = 1;
  }
}
