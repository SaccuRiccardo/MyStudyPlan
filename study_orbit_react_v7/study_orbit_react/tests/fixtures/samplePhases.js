import { hoursBySubject } from "../../src/lib/planner.js";
// Synthetic regression fixtures; never loaded into the app.
export function samplePhases() {
  return ["project", "exams"].map((id) => {
    const subjects = [
      { id: "math", name: "Mathematics", tier: "SS", color: "#6559c3" },
      { id: "writing", name: "Writing", tier: "A", color: "#2674ad" },
    ];
    const slots = Array.from({ length: 7 }, (_, day) =>
      [
        [540, 720],
        [840, 960],
        [960, 1080],
      ].map(([start, end], index) => ({
        id: `${day}-${index}`,
        day,
        start,
        end,
        subjectId: index % 2 ? "writing" : "math",
        fixed: (day === 3 || day === 4) && index === 0,
        protected: (day === 3 || day === 4) && index === 0,
      })),
    ).flat();
    const phase = {
      id,
      name: `Sample ${id}`,
      subjects,
      slots,
      totalTarget: 49,
      template: "classic",
      targetHours: {},
    };
    phase.targetHours = hoursBySubject(phase);
    return phase;
  });
}
