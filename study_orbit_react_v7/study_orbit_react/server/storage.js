import { backupName, validBackupName } from "../src/lib/backupNames.js";
import { presetErrors } from "../src/lib/availability.js";
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
  lstat,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const PROJECT_DIR = process.env.STUDY_ORBIT_DATA_ROOT
  ? path.resolve(process.env.STUDY_ORBIT_DATA_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const STATE_DIR = path.join(PROJECT_DIR, "Current_State");
export const BACKUP_DIR = path.join(PROJECT_DIR, "Backups");
const STATE_FILE = path.join(STATE_DIR, "state.json");
const EMPTY_STATE = Object.freeze({
  version: 7,
  theme: "light",
  subjects: [],
  presets: [],
  phases: [],
  phase: null,
  blocks: {},
  notes: {},
  handoffs: {},
  audioItems: [],
});

/** @brief Reject malformed persistent structures before any filesystem changes. */
export function validateState(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
    throw Object.assign(new Error("State must be a JSON object"), {
      statusCode: 400,
    });
  if (!Array.isArray(candidate.phases) || !Array.isArray(candidate.audioItems))
    throw Object.assign(new Error("Expected phases and audioItems arrays"), {
      statusCode: 400,
    });
  for (const field of ["blocks", "notes", "handoffs"]) {
    if (
      !candidate[field] ||
      typeof candidate[field] !== "object" ||
      Array.isArray(candidate[field])
    )
      throw Object.assign(new Error(`Expected ${field} object`), {
        statusCode: 400,
      });
  }
  if (candidate.phase != null && typeof candidate.phase !== "string")
    throw Object.assign(new Error("Invalid active phase"), { statusCode: 400 });
  const invalid = (message) => {
    throw Object.assign(new Error(message), { statusCode: 400 });
  };
  if (candidate.version !== 7)
    invalid(
      "Expected a version-7 state. Import older exports through the application.",
    );
  if (candidate.subjects !== undefined && !Array.isArray(candidate.subjects))
    invalid("Expected a subject library array.");
  if (candidate.presets !== undefined) {
    if (!Array.isArray(candidate.presets))
      invalid("Expected a preset library array.");
    if (
      candidate.presets.some(
        (preset) =>
          typeof preset?.id !== "string" || presetErrors(preset).length,
      )
    )
      invalid("Invalid weekly preset.");
    if (
      new Set(candidate.presets.map((preset) => preset.id)).size !==
      candidate.presets.length
    )
      invalid("Duplicate preset ID.");
  }
  const phaseIds = new Set();
  for (const phase of candidate.phases) {
    if (
      !phase ||
      typeof phase.id !== "string" ||
      typeof phase.name !== "string" ||
      !Array.isArray(phase.subjects) ||
      !Array.isArray(phase.slots) ||
      !phase.targetHours ||
      typeof phase.targetHours !== "object"
    )
      invalid("Invalid phase structure.");
    if (phaseIds.has(phase.id)) invalid("Duplicate phase ID.");
    phaseIds.add(phase.id);
    if (phase.availability && presetErrors(phase.availability).length)
      invalid("Invalid phase availability.");
    if (
      phase.subjects.some(
        (s) => !s || typeof s.id !== "string" || typeof s.name !== "string",
      )
    )
      invalid("Invalid subject.");
    if (
      phase.slots.some(
        (s) =>
          !s ||
          typeof s.id !== "string" ||
          typeof s.subjectId !== "string" ||
          !Number.isInteger(s.day) ||
          s.day < 0 ||
          s.day > 6 ||
          !Number.isFinite(s.start) ||
          !Number.isFinite(s.end) ||
          s.start < 0 ||
          s.end > 2880 ||
          s.end <= s.start ||
          s.end - s.start > 720,
      )
    )
      invalid("Invalid study block.");
  }
  if (
    candidate.phases.length
      ? !phaseIds.has(candidate.phase)
      : candidate.phase !== null
  )
    invalid("Choose exactly one existing active phase.");
  return candidate;
}

/** @brief Create missing local folders and an empty state without overwriting existing data. */
export async function ensureStorage() {
  await mkdir(STATE_DIR, { recursive: true });
  await mkdir(BACKUP_DIR, { recursive: true });
  if (!existsSync(STATE_FILE))
    await writeFile(STATE_FILE, JSON.stringify(EMPTY_STATE, null, 2) + "\n", {
      flag: "wx",
    }).catch((error) => {
      if (error.code !== "EEXIST") throw error;
    });
}

/** @brief Read and validate the active JSON inside the exclusive storage queue. */
async function getStateUnlocked() {
  await ensureStorage();
  return validateState(JSON.parse(await readFile(STATE_FILE, "utf8")));
}

// Write a temporary sibling, then rename it over state.json, preventing partial JSON writes.
/** @brief Write a temporary sibling then atomically replace the active JSON. */
async function putStateUnlocked(nextState) {
  validateState(nextState);
  await ensureStorage();
  const temp = path.join(
    STATE_DIR,
    `.state-${randomBytes(8).toString("hex")}.tmp`,
  );
  try {
    await writeFile(temp, JSON.stringify(nextState, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temp, STATE_FILE);
    return nextState;
  } finally {
    await rm(temp, { force: true });
  }
}

/** @brief Refuse unexpected file types before copying state directory trees. */
async function verifyNoSymlinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink())
      throw new Error("State folders may not contain symbolic links");
    if (entry.isDirectory())
      await verifyNoSymlinks(path.join(directory, entry.name));
    else if (!entry.isFile())
      throw new Error(
        "State folders may only contain regular files and directories",
      );
  }
}

/** @brief Copy a complete stable state tree and publish the snapshot only when complete. */
async function createBackupUnlocked(timeZone) {
  await ensureStorage();
  const state = await getStateUnlocked(); // refuse to snapshot malformed JSON
  await verifyNoSymlinks(STATE_DIR);
  const createdAt = new Date();
  const phase = state.phases.find((phase) => phase.id === state.phase);
  let name;
  try {
    name = backupName(
      phase?.name,
      createdAt,
      timeZone,
      randomBytes(4).toString("hex"),
    );
  } catch {
    throw Object.assign(new Error("Invalid backup timezone"), {
      statusCode: 400,
    });
  }
  const dest = path.join(BACKUP_DIR, name);
  const staging = `${dest}.partial`;
  try {
    await cp(STATE_DIR, staging, {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
    await rename(staging, dest);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  return { name, createdAt: createdAt.toISOString() };
}

/** @brief List completed snapshots while ignoring temporary backup folders. */
async function listBackupsUnlocked() {
  await ensureStorage();
  const entries = await readdir(BACKUP_DIR, { withFileTypes: true });
  const names = entries
    .filter((e) => e.isDirectory() && validBackupName(e.name))
    .map((e) => e.name);
  const backups = await Promise.all(
    names.map(async (name) => {
      const info = await stat(path.join(BACKUP_DIR, name));
      return {
        name,
        createdAt: info.birthtime.toISOString(),
        sizeBytes: info.size,
      };
    }),
  );
  return backups.sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || b.name.localeCompare(a.name),
  );
}

/** @brief Stage a validated full snapshot and roll back directory replacement on failure. */
async function restoreBackupUnlocked(name) {
  if (!validBackupName(name))
    throw Object.assign(new Error("Invalid backup name"), { statusCode: 400 });
  await ensureStorage();
  const source = path.join(BACKUP_DIR, name);
  if (!existsSync(source) || !(await lstat(source)).isDirectory())
    throw Object.assign(new Error("Backup not found"), { statusCode: 404 });
  await verifyNoSymlinks(source);
  const recoveredState = validateState(
    JSON.parse(await readFile(path.join(source, "state.json"), "utf8")),
  );
  // Stage a full directory clone; replace Current_State only after everything is copied/validated.
  const suffix = randomBytes(6).toString("hex");
  const stage = path.join(PROJECT_DIR, `.state-restore-${suffix}`);
  const previous = path.join(PROJECT_DIR, `.state-previous-${suffix}`);
  let oldMoved = false;
  try {
    await cp(source, stage, {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
    await rename(STATE_DIR, previous);
    oldMoved = true;
    await rename(stage, STATE_DIR);
    await rm(previous, { recursive: true, force: true }).catch((error) =>
      console.warn(`Restored state; old directory retained: ${error.message}`),
    );
    return recoveredState;
  } catch (error) {
    if (oldMoved && !existsSync(STATE_DIR)) await rename(previous, STATE_DIR);
    throw error;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

// A restore temporarily renames Current_State. Every public operation must share this queue.
let storageQueue = Promise.resolve();
/** @brief Run one complete file operation at a time and recover the queue after errors. */
function serialize(operation) {
  const result = storageQueue.then(operation);
  storageQueue = result.catch(() => {});
  return result;
}
/** @brief Read a consistent state, waiting for outstanding writes or restores. */
export const getState = () => serialize(getStateUnlocked);
/** @brief Atomically persist a state without racing snapshots or restores. */
export const putState = (state) => serialize(() => putStateUnlocked(state));
/** @brief Snapshot a stable directory after earlier saves finish. */
export const createBackup = (timeZone) =>
  serialize(() => createBackupUnlocked(timeZone));
/** @brief List only completed snapshots outside any in-progress restoration. */
export const listBackups = () => serialize(listBackupsUnlocked);
/** @brief Restore a snapshot as one exclusive storage operation. */
export const restoreBackup = (name) =>
  serialize(() => restoreBackupUnlocked(name));
