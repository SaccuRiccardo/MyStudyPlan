import { WEEK_MINUTES } from "./time.js";

/** @brief Reject malformed availability entries before they reach scheduling or storage. */
export function validWindow(window) {
  return (
    window &&
    typeof window.id === "string" &&
    (window.label === undefined || typeof window.label === "string") &&
    Number.isInteger(window.day) &&
    window.day >= 0 &&
    window.day < 7 &&
    Number.isInteger(window.start) &&
    Number.isInteger(window.end) &&
    window.start >= 0 &&
    window.end <= 2880 &&
    window.end > window.start &&
    window.end - window.start <= 720 &&
    ["study", "unavailable"].includes(window.kind)
  );
}

/** @brief Validate a reusable subject-free weekly template; blocked time may overlap study time. */
export function presetErrors(preset) {
  const errors = [];
  if (preset?.notes !== undefined && typeof preset.notes !== "string")
    errors.push("Study notes must be text.");
  if (!preset || typeof preset.name !== "string" || !preset.name.trim())
    errors.push("Give this preset a name.");
  if (
    !Array.isArray(preset?.windows) ||
    preset.windows.some((window) => !validWindow(window))
  )
    errors.push("Use valid days and times, with each window at most 12 hours.");
  if (
    Array.isArray(preset?.windows) &&
    new Set(preset.windows.map((window) => window?.id)).size !==
      preset.windows.length
  )
    errors.push("Availability window IDs must be unique.");
  return errors;
}

/** @brief Merge overlapping intervals so overlapping availability never counts twice. */
function mergeIntervals(intervals) {
  const merged = [];
  for (const interval of intervals.sort((a, b) => a.start - b.start)) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end)
      previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
  }
  return merged;
}

/** @brief Resolve usable study windows after subtracting recurring university and fixed commitments. */
export function studyWindows(windows, commitments = []) {
  const blocked = [
    ...windows.filter((window) => window.kind === "unavailable"),
    ...commitments,
  ];
  const result = [];
  // Keep each study day's identity even when a window crosses midnight or the weekly boundary.
  for (let day = 0; day < 7; day++) {
    const available = mergeIntervals(
      windows
        .filter(
          (window) =>
            window.kind === "study" &&
            window.day === day &&
            validWindow(window),
        )
        .map((window) => ({
          start: day * 1440 + window.start,
          end: day * 1440 + window.end,
        })),
    );
    for (const interval of available) {
      let pieces = [interval];
      // Subtract other study days too, so a Monday overnight window and Tuesday window cannot overlap.
      const earlierDays = windows.filter(
        (window) =>
          window.kind === "study" && window.day < day && validWindow(window),
      );
      for (const block of [...blocked, ...earlierDays]) {
        for (const offset of [-WEEK_MINUTES, 0, WEEK_MINUTES]) {
          const start = block.day * 1440 + block.start + offset,
            end = block.day * 1440 + block.end + offset;
          pieces = pieces.flatMap((piece) =>
            end <= piece.start || start >= piece.end
              ? [piece]
              : [
                  ...(start > piece.start
                    ? [{ start: piece.start, end: start }]
                    : []),
                  ...(end < piece.end ? [{ start: end, end: piece.end }] : []),
                ],
          );
        }
      }
      // Lower-numbered study days own any overlap across the Sunday/Monday boundary as well.
      for (const piece of pieces) {
        let start = piece.start - day * 1440;
        const end = piece.end - day * 1440;
        // Keep generated blocks within the same 12-hour editing limit as manual blocks.
        while (start < end) {
          const until = Math.min(end, start + 720);
          result.push({
            id: `available-${day}-${start}`,
            day,
            start,
            end: until,
          });
          start = until;
        }
      }
    }
  }
  return result;
}

/** @brief Calculate usable hours, not the sum of overlapping or blocked windows. */
export function availableHours(windows) {
  return studyWindows(windows).reduce(
    (sum, window) => sum + (window.end - window.start) / 60,
    0,
  );
}

/** @brief Offer editable starting points without attaching any course or required weekly total. */
export function starterWindows(kind) {
  const periods =
    kind === "night"
      ? [
          [660, 840],
          [1140, 1260],
          [1500, 1620],
        ]
      : kind === "blank"
        ? []
        : [
            [540, 720],
            [840, 960],
            [960, 1080],
          ];
  return Array.from({ length: kind === "weekdays" ? 6 : 7 }, (_, day) =>
    periods.map(([start, end], index) => ({
      id: `${kind}-${day}-${index}`,
      day,
      start,
      end,
      kind: "study",
    })),
  ).flat();
}
