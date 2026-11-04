import { ArrowUpRight, CalendarDays } from "lucide-react";
import { subjectName } from "../lib/planner.js";

/** @brief Show the next usable session and its saved subject note. */
export default function NextBlock({ phase, next, handoffs, onEdit }) {
  const subjectId = next?.slot.subjectId;
  const note = subjectId ? handoffs[subjectId]?.text : null;
  return (
    <section className="panel next-block">
      <div className="panel-overline">
        <CalendarDays size={16} /> UP NEXT
      </div>
      <div>
        <h3>
          {next?.slot.title ||
            (next ? subjectName(phase, subjectId) : "No upcoming block")}
        </h3>
        <p>
          {next
            ? `${next.actualStart.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · ${next.actualStart.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}–${next.end.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
            : "Enjoy the free time in your schedule."}
        </p>
      </div>
      <div className="next-note">
        <strong>START HERE NEXT TIME</strong>
        <p>{note?.trim() || "No instructions saved yet."}</p>
        {next && (
          <button className="text-button" onClick={() => onEdit(subjectId)}>
            Write a next step <ArrowUpRight size={13} />
          </button>
        )}
      </div>
    </section>
  );
}
