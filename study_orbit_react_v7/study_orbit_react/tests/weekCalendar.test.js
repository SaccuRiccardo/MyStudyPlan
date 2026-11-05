import test from "node:test";
import assert from "node:assert/strict";
import { calendarSegments, calendarRange } from "../src/lib/weekCalendar.js";
test("calendar shows full weeks and splits overnight sessions on their civil days", () => {
  const slots = [
    { id: "mon", day: 0, start: 1380, end: 1530 },
    { id: "sun", day: 6, start: 1500, end: 1620 },
    { id: "wed", day: 2, start: 540, end: 660 },
  ];
  const result = calendarSegments(slots);
  assert.deepEqual(
    result.map(({ slot, day, start, end, continued }) => [
      slot.id,
      day,
      start,
      end,
      continued,
    ]),
    [
      ["sun", 0, 60, 180, false],
      ["mon", 0, 1380, 1440, false],
      ["mon", 1, 0, 90, true],
      ["wed", 2, 540, 660, false],
    ],
  );
  assert.equal(
    result.reduce((sum, s) => sum + s.end - s.start, 0),
    slots.reduce((sum, s) => sum + s.end - s.start, 0),
  );
  assert.deepEqual(calendarRange(result), { start: 0, end: 1440 });
});
test("midnight endpoints do not produce empty cells and daytime range fits the schedule", () => {
  const slots = [
    { id: "math", day: 0, start: 550, end: 675 },
    { id: "law", day: 1, start: 1380, end: 1440 },
  ];
  const result = calendarSegments(slots);
  assert.equal(result.length, 2);
  assert.deepEqual(calendarRange(result), { start: 540, end: 1440 });
  assert.deepEqual(calendarSegments([]), []);
  assert.deepEqual(calendarRange([]), { start: 540, end: 1080 });
});

test("live marker follows local civil time, including seconds and midnight rollover", async () => {
  const { calendarNow } = await import("../src/lib/weekCalendar.js");
  const mid = calendarNow(new Date(2026, 10, 5, 12, 0, 30), 540, 1080);
  assert.equal(mid.day, 3);
  assert.equal(mid.time, "12:00");
  assert.ok(mid.percent > 33.33 && mid.percent < 33.5);
  assert.equal(mid.outside, null);
  assert.equal(calendarNow(new Date(2026, 10, 8, 23, 59), 0, 1440).day, 6);
  const monday = calendarNow(new Date(2026, 10, 9, 0, 0), 0, 1440);
  assert.equal(monday.day, 0);
  assert.equal(monday.percent, 0);
  assert.equal(
    calendarNow(new Date(2026, 10, 5, 8, 0), 540, 1080).outside,
    "Before shown hours",
  );
  assert.equal(
    calendarNow(new Date(2026, 10, 5, 20, 0), 540, 1080).percent,
    100,
  );
});
