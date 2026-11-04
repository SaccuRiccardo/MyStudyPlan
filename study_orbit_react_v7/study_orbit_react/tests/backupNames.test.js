import test from "node:test";
import assert from "node:assert/strict";
import { backupName, validBackupName } from "../src/lib/backupNames.js";

test("backup names use the requested local clock including DST and fractional offsets", () => {
  const instant = new Date("2026-11-04T09:05:06Z");
  assert.equal(
    backupName("Winter exams", instant, "Europe/Rome", "abcdef12"),
    "Winter exams__2026-11-04_10-05-06_UTC+01-00__abcdef12",
  );
  assert.match(
    backupName(
      "Summer",
      new Date("2026-07-04T09:05:06Z"),
      "Europe/Rome",
      "abcdef12",
    ),
    /11-05-06_UTC\+02-00/,
  );
  assert.match(
    backupName("Math", instant, "Asia/Kolkata", "abcdef12"),
    /14-35-06_UTC\+05-30/,
  );
  assert.match(
    backupName("Math", instant, "America/New_York", "abcdef12"),
    /04-05-06_UTC-05-00/,
  );
});
test("names are portable and traversal is rejected without losing legacy compatibility", () => {
  for (const label of ["../Math: exam?", "日本語", " ", "a".repeat(200)]) {
    const name = backupName(label, new Date(), "UTC", "abcdef12");
    assert.ok(validBackupName(name));
    assert.ok(!name.includes("/"));
  }
  assert.ok(validBackupName("State_20261103T172530123Z_07eaf551"));
  for (const name of [
    "../etc/passwd",
    "",
    null,
    "State_20261103T172530123Z_07eaf551/../file",
  ])
    assert.equal(validBackupName(name), false);
});
