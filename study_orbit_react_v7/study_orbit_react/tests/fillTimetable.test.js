import test from "node:test";
import assert from "node:assert/strict";
import {
  freshPhase,
  scheduledHours,
  hoursBySubject,
  slotsOverlap,
} from "../src/lib/planner.js";
import {
  useAvailability,
  suggestForAvailability,
  adaptToAvailability,
  flexibleErrors,
  planningWarnings,
} from "../src/lib/flexiblePlanner.js";
import { subjectRuns } from "../src/lib/fillTimetable.js";
import { roundHalfHours, shareHalfHours } from "../src/lib/halfHours.js";
import { starterWindows } from "../src/lib/availability.js";
import { formatHours } from "../src/lib/time.js";

/** @brief Start small independent scheduling fixtures without reading personal files. */
function phase(windows, goals = { math: 3, law: 3 }, fixed = []) {
  return useAvailability(
    {
      ...freshPhase(),
      name: "Semester",
      subjects: Object.keys(goals).map((id, index) => ({
        id,
        name: id,
        tier: index === 0 ? "SS" : "B",
      })),
      targetHours: goals,
      slots: fixed,
    },
    {
      name: "Week",
      windows: windows.map((window, index) => ({
        id: `w${index}`,
        day: 0,
        kind: "study",
        ...window,
      })),
    },
  );
}

/** @brief Assert the actual generated schedule obeys unit, availability, identity and continuity rules. */
function checkFill(input, output) {
  const originalLocks = input.slots.filter(
    (slot) => slot.fixed || slot.protected,
  );
  assert.deepEqual(
    output.slots.filter((slot) => slot.fixed || slot.protected),
    originalLocks,
  );
  assert.deepEqual(flexibleErrors(output), []);
  assert.equal(
    new Set(output.slots.map((slot) => slot.id)).size,
    output.slots.length,
  );
  for (const slot of output.slots.filter(
    (slot) => !slot.fixed && !slot.protected,
  )) {
    assert.equal((slot.end - slot.start) % 30, 0);
    const run = subjectRuns(output.slots, slot.day, slot.subjectId).find(
      (run) => run.start <= slot.start && run.end >= slot.end,
    );
    assert.ok(
      run.end - run.start >= 90,
      "Generated study must belong to a 90-minute stretch",
    );
  }
  for (let day = 0; day < 7; day++)
    for (const subject of output.subjects) {
      if (subjectRuns(originalLocks, day, subject.id).length <= 1)
        assert.ok(subjectRuns(output.slots, day, subject.id).length <= 1);
    }
  for (let i = 0; i < output.slots.length; i++)
    for (let j = i + 1; j < output.slots.length; j++)
      assert.equal(slotsOverlap(output.slots[i], output.slots[j]), false);
}

test("rank suggestions and hour text never expose arbitrary fractional recommendations", () => {
  const input = phase(starterWindows("classic"), {
    math: 0,
    law: 0,
    physics: 0,
  });
  input.subjects[1].tier = "S";
  input.subjects[2].tier = "A";
  const result = suggestForAvailability(input);
  assert.equal(
    Object.values(result.targetHours).reduce((a, b) => a + b),
    49,
  );
  for (const hours of Object.values(result.targetHours))
    assert.equal(hours * 2, Math.round(hours * 2));
  assert.equal(roundHalfHours(12.993), 13);
  assert.equal(roundHalfHours(12.26), 12.5);
  assert.equal(formatHours(12.5), "12.5");
  assert.equal(formatHours(13), "13");
  assert.equal(formatHours(12.993), "13");
  assert.equal(formatHours(23 / 60), "0:23");
  assert.deepEqual(shareHalfHours({ a: 4, b: 3, c: 2 }, 7), {
    a: 3,
    b: 2,
    c: 2,
  });
});

test("a realistic six-course week fills 49 hours without scattered repeats or tiny sessions", () => {
  const input = phase(starterWindows("classic"), {
    math: 0,
    law: 0,
    physics: 0,
    biology: 0,
    history: 0,
    writing: 0,
  });
  ["SS", "S", "A", "A", "B", "B"].forEach((tier, index) => {
    input.subjects[index].tier = tier;
  });
  const suggested = suggestForAvailability(input),
    filled = adaptToAvailability(suggested);
  checkFill(suggested, filled);
  assert.equal(scheduledHours(filled), 49);
  assert.deepEqual(hoursBySubject(filled), suggested.targetHours);
  assert.ok(
    filled.slots.length <= 28,
    "Prefer longer sessions to scattering every course into every day",
  );
  assert.deepEqual(adaptToAvailability(filled).slots, filled.slots);
});

test("one course cannot occupy both disconnected periods of the same study day", () => {
  const input = phase(
    [
      { start: 540, end: 660 },
      { start: 840, end: 960 },
    ],
    { math: 4 },
  );
  const filled = adaptToAvailability(input);
  checkFill(input, filled);
  assert.equal(scheduledHours(filled), 2);
  assert.equal(filled.targetHours.math, 4);
  assert.ok(
    planningWarnings(filled).some((warning) => warning.includes("continuous")),
  );
});

test("the search can leave an early short window free to place a longer continuous block later", () => {
  const input = phase(
    [
      { start: 540, end: 600 },
      { start: 840, end: 960 },
    ],
    { math: 2 },
  );
  const filled = adaptToAvailability(input);
  checkFill(input, filled);
  assert.equal(scheduledHours(filled), 2);
  assert.equal(filled.slots[0].start, 840);
});

test("touching preset windows form one continuous course session", () => {
  const input = phase(
    [
      { start: 540, end: 600 },
      { start: 600, end: 720 },
    ],
    { math: 3 },
  );
  const filled = adaptToAvailability(input);
  checkFill(input, filled);
  assert.equal(filled.slots.length, 1);
  assert.equal(scheduledHours(filled), 3);
});

test("a 09–12 lock is unchanged and only the remaining cells are filled", () => {
  const lock = {
    id: "my-lock",
    day: 0,
    start: 540,
    end: 720,
    subjectId: "math",
    fixed: true,
  };
  const input = phase([{ start: 540, end: 1080 }], { math: 6, law: 3 }, [lock]);
  const filled = adaptToAvailability(input);
  checkFill(input, filled);
  assert.equal(scheduledHours(filled), 9);
  assert.deepEqual(hoursBySubject(filled), { math: 6, law: 3 });
  assert.ok(filled.slots.some((slot) => slot.subjectId === "law"));
  assert.deepEqual(input.slots, [lock]);
});

test("a later protected session can have a same-course continuation without a separate daily run", () => {
  const lock = {
    id: "protected",
    day: 0,
    start: 720,
    end: 900,
    subjectId: "math",
    fixed: true,
    protected: true,
  };
  const input = phase([{ start: 540, end: 1080 }], { math: 6, law: 3 }, [lock]);
  const filled = adaptToAvailability(input);
  checkFill(input, filled);
  assert.equal(scheduledHours(filled), 9);
  assert.deepEqual(hoursBySubject(filled), { math: 6, law: 3 });
});

test("disjoint user locks are preserved as reported exceptions and do not create more repeats", () => {
  const fixed = [
    {
      id: "morning",
      day: 0,
      start: 540,
      end: 600,
      subjectId: "math",
      fixed: true,
    },
    {
      id: "evening",
      day: 0,
      start: 900,
      end: 960,
      subjectId: "math",
      fixed: true,
    },
  ];
  const input = phase([{ start: 540, end: 1080 }], { math: 5, law: 3 }, fixed);
  const filled = adaptToAvailability(input);
  checkFill(input, filled);
  assert.equal(
    filled.slots.filter((slot) => slot.subjectId === "math").length,
    2,
  );
  assert.ok(
    planningWarnings(filled).some((warning) =>
      warning.includes("separate locked"),
    ),
  );
});

test("manual repeated courses and minute-level goals are flagged before saving", () => {
  const input = phase([{ start: 540, end: 1080 }], { math: 2 });
  input.slots = [
    { id: "a", day: 0, start: 540, end: 600, subjectId: "math" },
    { id: "b", day: 0, start: 840, end: 900, subjectId: "math" },
  ];
  assert.ok(
    flexibleErrors(input).some((error) => error.includes("separate sessions")),
  );
  input.targetHours.math = 12.993;
  assert.ok(
    flexibleErrors(input).some((error) => error.includes("whole or half")),
  );
  input.slots = [{ id: "c", day: 0, start: 540, end: 580, subjectId: "math" }];
  assert.ok(
    flexibleErrors(input).some((error) =>
      error.includes("Study sessions must"),
    ),
  );
});

test("leftover minutes stay free, including constraints cutting across a window", () => {
  const input = phase([{ start: 550, end: 647 }], { math: 2 });
  const filled = adaptToAvailability(input);
  checkFill(input, filled);
  assert.equal(scheduledHours(filled), 1.5);
  assert.equal(filled.slots[0].start, 550);
  const short = phase([{ start: 540, end: 563 }], { math: 0.5 });
  assert.equal(adaptToAvailability(short).slots.length, 0);
});

test("old minute-level goals are converted on fill while existing unusual locks keep their exact times", () => {
  const lock = {
    id: "legacy",
    day: 0,
    start: 540,
    end: 585,
    subjectId: "math",
    fixed: true,
  };
  const input = phase([{ start: 540, end: 720 }], { math: 1.993, law: 0.5 }, [
    lock,
  ]);
  const suggested = suggestForAvailability(input);
  assert.ok(
    Object.values(suggested.targetHours).every((hours) =>
      Number.isInteger(hours * 2),
    ),
  );
  const filled = adaptToAvailability(input);
  checkFill(input, filled);
  assert.deepEqual(filled.targetHours, { math: 2, law: 0.5 });
  assert.equal(filled.slots.find((slot) => slot.id === "legacy").end, 585);
});

test("overnight blocks keep their study-day ownership and avoid weekly overlaps", () => {
  const input = phase(
    [
      { day: 6, start: 1500, end: 1680 },
      { day: 0, start: 60, end: 120 },
    ],
    { math: 1.5, law: 1.5 },
  );
  const filled = adaptToAvailability(input);
  checkFill(input, filled);
  assert.ok(filled.slots.some((slot) => slot.day === 6 && slot.start >= 1500));
});

/** @brief Exhaust every assignment for a tiny fixture to independently check the search's achieved fill. */
function exhaustiveMinutes(cells, goals) {
  let maximum = 0;
  const subjects = Object.keys(goals);
  function visit(index, slots, used) {
    if (index === cells.length) {
      if (
        subjects.some((subjectId) =>
          subjectRuns(slots, 0, subjectId).some(
            (run) => run.end - run.start < 90,
          ),
        )
      )
        return;
      maximum = Math.max(maximum, slots.length * 30);
      return;
    }
    visit(index + 1, slots, used);
    for (const subjectId of subjects) {
      if ((used[subjectId] || 0) >= goals[subjectId] * 2) continue;
      const slot = { ...cells[index], subjectId };
      const proposed = [...slots, slot];
      if (subjectRuns(proposed, 0, subjectId).length > 1) continue;
      visit(index + 1, proposed, {
        ...used,
        [subjectId]: (used[subjectId] || 0) + 1,
      });
    }
  }
  visit(0, [], {});
  return maximum;
}

test("the combination search matches exhaustive fills for representative small gapped plans", () => {
  for (const first of [1, 2, 3])
    for (const second of [1, 2, 3]) {
      const windows = [
        { start: 540, end: 540 + first * 30 },
        { start: 840, end: 840 + second * 30 },
      ];
      for (const goals of [
        { math: 1, law: 1 },
        { math: 1.5, law: 0.5 },
        { math: 2, law: 0 },
      ]) {
        const cells = windows.flatMap((window) =>
          Array.from(
            { length: (window.end - window.start) / 30 },
            (_, index) => ({
              day: 0,
              start: window.start + index * 30,
              end: window.start + (index + 1) * 30,
            }),
          ),
        );
        const input = phase(windows, goals),
          filled = adaptToAvailability(input);
        checkFill(input, filled);
        assert.equal(
          scheduledHours(filled) * 60,
          exhaustiveMinutes(cells, goals),
        );
      }
    }
});

test("half-hour and one-hour gaps stay free rather than fragmenting a two-hour goal", () => {
  const input = phase(
    [
      { day: 0, start: 660, end: 690 },
      { day: 1, start: 540, end: 600 },
      { day: 2, start: 540, end: 570 },
      { day: 3, start: 540, end: 660 },
    ],
    { math: 2 },
  );
  const output = adaptToAvailability(input);
  checkFill(input, output);
  assert.deepEqual(
    output.slots.map(({ day, start, end }) => ({ day, start, end })),
    [{ day: 3, start: 540, end: 660 }],
  );
});

test("a 90-minute window is a fallback, but goals never authorize a tiny standalone session", () => {
  const input = phase([{ start: 540, end: 630 }], { math: 2 });
  const output = adaptToAvailability(input);
  checkFill(input, output);
  assert.equal(scheduledHours(output), 1.5);
  for (const hours of [0.5, 1]) {
    const smallGoal = phase([{ start: 540, end: 780 }], { math: hours });
    assert.equal(adaptToAvailability(smallGoal).slots.length, 0);
  }
});

test("equally full plans favor 2h+ sessions over 90-minute sessions", () => {
  const input = phase([{ start: 540, end: 780 }], { math: 3, law: 3 });
  const output = adaptToAvailability(input);
  checkFill(input, output);
  assert.equal(scheduledHours(output), 4);
  assert.deepEqual(
    output.slots.map((slot) => slot.end - slot.start),
    [120, 120],
  );
});

test("a short extension is useful only when it joins an existing 90-minute study stretch", () => {
  const lock = {
    id: "lock",
    day: 0,
    start: 600,
    end: 660,
    subjectId: "math",
    fixed: true,
  };
  const input = phase([{ start: 570, end: 660 }], { math: 1.5 }, [lock]);
  const output = adaptToAvailability(input);
  checkFill(input, output);
  assert.equal(scheduledHours(output), 1.5);
  assert.deepEqual(
    output.slots.find((slot) => slot.fixed),
    lock,
  );
  const tinyLock = { ...lock, start: 630 };
  const shortInput = phase([{ start: 600, end: 660 }], { math: 1 }, [tinyLock]);
  const shortOutput = adaptToAvailability(shortInput);
  assert.deepEqual(shortOutput.slots, [tinyLock]);
});
