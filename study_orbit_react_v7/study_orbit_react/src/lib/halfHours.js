export const HALF_HOUR_MINUTES = 30;

/** @brief Snap a requested workload to a whole or half hour, never to arbitrary decimals. */
export function roundHalfHours(hours) {
  const value = Number(hours);
  return Number.isFinite(value) ? Math.max(0, Math.round(value * 2) / 2) : 0;
}

/** @brief Count complete half-hour sessions; a short leftover must stay free. */
export function halfHourUnits(minutes) {
  return Math.max(0, Math.floor((minutes + 1e-7) / HALF_HOUR_MINUTES));
}

/** @brief Recognize editable goals that already use whole or half hours. */
export function isHalfHourGoal(hours) {
  return (
    Number.isFinite(Number(hours)) &&
    Number(hours) >= 0 &&
    Number.isInteger(Number(hours) * 2)
  );
}

/** @brief Share an integer number of half hours using largest remainders and stable tie-breaking. */
export function shareHalfHours(weights, totalUnits) {
  const entries = Object.entries(weights);
  const sum = entries.reduce(
    (total, [, weight]) => total + Math.max(0, weight),
    0,
  );
  if (!sum) return Object.fromEntries(entries.map(([id]) => [id, 0]));
  const portions = entries
    .map(([id, weight], index) => {
      const raw = (totalUnits * Math.max(0, weight)) / sum;
      return { id, index, units: Math.floor(raw), remainder: raw % 1 };
    })
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  let left =
    totalUnits - portions.reduce((total, portion) => total + portion.units, 0);
  for (let index = 0; left > 0; index++, left--)
    portions[index % portions.length].units++;
  return Object.fromEntries(
    portions.map((portion) => [portion.id, portion.units]),
  );
}
