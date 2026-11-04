/** Build portable folder names using the browser's timezone, never a client-supplied path. */
export function backupName(phaseName, date, timeZone, suffix) {
  const phase =
    (phaseName || "Workspace")
      .normalize("NFC")
      .replace(/[^\p{L}\p{N} _-]/gu, "-")
      .trim()
      .slice(0, 40)
      .trim() || "Workspace";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZoneName: "longOffset",
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  const offset =
    parts.timeZoneName === "GMT"
      ? "+00-00"
      : parts.timeZoneName.replace("GMT", "").replace(":", "-");
  return `${phase}__${parts.year}-${parts.month}-${parts.day}_${parts.hour}-${parts.minute}-${parts.second}_UTC${offset}__${suffix}`;
}

export function validBackupName(name) {
  return (
    typeof name === "string" &&
    (/^State_[0-9]{8}T[0-9]{9}Z_[0-9a-f]{8}$/.test(name) ||
      /^[\p{L}\p{N} _-]{1,64}__[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}-[0-9]{2}-[0-9]{2}_UTC[+-][0-9]{2}-[0-9]{2}__[0-9a-f]{8}$/u.test(
        name,
      ))
  );
}
