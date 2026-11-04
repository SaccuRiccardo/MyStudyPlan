/** @brief Edit a clock time with an explicit next-day offset, keeping study-day identity visible. */
export default function TimeRange({
  value,
  onChange,
  label,
  disabled = false,
}) {
  const time = `${String(Math.floor((value % 1440) / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  const offset = Math.floor(value / 1440);
  return (
    <label className="time-field">
      {label}
      <span className="time-controls">
        <input
          type="time"
          aria-label={label}
          disabled={disabled}
          value={time}
          onChange={(event) => {
            if (!event.target.value) return;
            const [hours, minutes] = event.target.value.split(":").map(Number);
            onChange(offset * 1440 + hours * 60 + minutes);
          }}
        />
        <select
          aria-label={`${label} day offset`}
          disabled={disabled}
          value={offset}
          onChange={(event) =>
            onChange(Number(event.target.value) * 1440 + (value % 1440))
          }
        >
          <option value={0}>Study day</option>
          <option value={1}>+1 day</option>
          {offset === 2 && <option value={2}>+2 days (midnight)</option>}
        </select>
      </span>
    </label>
  );
}
