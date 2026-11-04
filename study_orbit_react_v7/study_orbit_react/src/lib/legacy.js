import { presetErrors } from "./availability.js";

/** @brief Recognize supported exports before replacing the current workspace. */
export function migrateExport(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Backup must contain an object");
  if (Array.isArray(raw.phases)) {
    if (raw.version != null && ![6, 7].includes(raw.version))
      throw new Error("Unsupported Study Orbit version.");
    if (
      raw.phases.some(
        (p) =>
          !p ||
          typeof p.id !== "string" ||
          typeof p.name !== "string" ||
          !Array.isArray(p.subjects) ||
          !Array.isArray(p.slots) ||
          p.subjects.some(
            (s) => !s || typeof s.id !== "string" || typeof s.name !== "string",
          ) ||
          p.slots.some(
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
              s.end <= s.start,
          ),
      )
    )
      throw new Error(
        "Invalid phase data; the current state has not been replaced.",
      );
    if (new Set(raw.phases.map((p) => p.id)).size !== raw.phases.length)
      throw new Error("Duplicate phase IDs in import.");
    if (
      raw.presets !== undefined &&
      (!Array.isArray(raw.presets) ||
        raw.presets.some(
          (preset) =>
            typeof preset?.id !== "string" || presetErrors(preset).length,
        ) ||
        new Set(raw.presets.map((preset) => preset.id)).size !==
          raw.presets.length)
    )
      throw new Error("Invalid preset library in import.");
    if (
      raw.phases.some(
        (phase) =>
          phase.availability && presetErrors(phase.availability).length,
      )
    )
      throw new Error("Invalid phase availability in import.");
    return raw;
  }
  if (raw.blocks && raw.handoffs && raw.phase) {
    throw new Error(
      "This v5 export has no timetable. Export a complete v6/v7 backup from your old installation; no personal timetable is bundled with this app.",
    );
  }
  throw new Error("This file does not look like a Study Orbit v6/v7 export.");
}
