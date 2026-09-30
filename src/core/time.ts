const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;

/** Formats an hour of the day (e.g. 14.5) as "14:30". */
export function formatHour(hour: number): string {
  const totalMinutes = Math.round(hour * MINUTES_PER_HOUR) % (HOURS_PER_DAY * MINUTES_PER_HOUR);
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
