const WALL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function offsetMinutes(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

// Converts the value of an <input type="datetime-local"> read in `tz` to
// an instant. Two passes settle the offset on either side of a DST change.
export function wallTimeToUtc(wall: string, tz: string): Date | null {
  const m = WALL_TIME.exec(wall);
  if (!m || !isValidTimeZone(tz)) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  let guess = naive - offsetMinutes(new Date(naive), tz) * 60_000;
  guess = naive - offsetMinutes(new Date(guess), tz) * 60_000;
  return new Date(guess);
}

export function utcToWallTime(instant: Date, tz: string): string {
  const shifted = new Date(instant.getTime() + offsetMinutes(instant, tz) * 60_000);
  return shifted.toISOString().slice(0, 16);
}
