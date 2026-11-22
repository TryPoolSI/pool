import type { Database } from "./supabase/database.types";
export type RideState = { error?: string; message?: string; path?: string };
export type RideOffer = Database["public"]["Functions"]["ride_offer"]["Returns"][number];
export function rideError(code: string) {
  switch (code) {
    case "PT401": return "Sign in again, then try once more.";
    case "PT404": return "This ride isn’t available to your account.";
    case "PT409": case "23505": return "Someone else just changed this ride. It updates here in a moment; then try again.";
    case "PT423": return "Riders can’t change after the first pickup.";
    case "PT400": case "23514": case "23503": return "Something in this ride doesn’t fit. Check the places, the times and who’s riding.";
    default: return "That didn’t go through. Your entries are still here, so check your connection and try again.";
  }
}
export function validTimezone(zone: string) {
  if (zone !== "UTC" && !zone.includes("/")) throw new Error("That time zone isn’t recognized.");
  try { new Intl.DateTimeFormat("en", { timeZone: zone }).format(); }
  catch { throw new Error("That time zone isn’t recognized."); }
  return zone;
}
export function localDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.slice(0, 4) < "1900" || value.slice(0, 4) > "9998") throw new Error("Choose a valid date.");
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Choose a valid date.");
  return date;
}
// Resolve wall time using actual zone offsets. Gaps are rejected. Repeated hours
// require an explicit occurrence; neither JS Date nor Postgres silently picks one.
export function zonedInstant(local: string, zone: string, occurrence = "reject") {
  validTimezone(zone);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) || !["reject", "earlier", "later"].includes(occurrence)) throw new Error("Choose a date and a time.");
  localDate(local.slice(0, 10));
  if (Number(local.slice(11, 13)) > 23 || Number(local.slice(14, 16)) > 59) throw new Error("Choose a time.");
  const nominal = Date.parse(`${local}:00Z`);
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const wall = (instant: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  };
  const matches = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = nominal + hours * 3_600_000;
    const offset = Date.parse(`${wall(sample)}Z`) - sample;
    const candidate = nominal - offset;
    if (wall(candidate) === `${local}:00`) matches.add(candidate);
  }
  const instants = [...matches].sort((a, b) => a - b);
  if (!instants.length) throw new Error("That time is skipped when the clocks go forward. Choose another time.");
  if (instants.length > 1 && occurrence === "reject") throw new Error("That hour occurs twice when the clocks go back. Choose the earlier or later one below.");
  return new Date(occurrence === "later" ? instants.at(-1)! : instants[0]).toISOString();
}
// The device's own timezone. Rides are planned in it, so nobody types one.
export function deviceTimezone() {
  try {
    return validTimezone(new Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return "UTC";
  }
}
function offsetAt(instant: Date, zone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" }).formatToParts(instant).find((part) => part.type === "timeZoneName")?.value;
}
// A ride's UTC offset is shown only when it differs from the reader's own clock
// at that moment. Most rides are local, and a bare "7:40 AM" reads faster.
function zoneNote(instant: Date, zone: string, reader: string): Intl.DateTimeFormatOptions {
  return offsetAt(instant, zone) === offsetAt(instant, reader) ? {} : { timeZoneName: "shortOffset" };
}
export function rideTime(instant: string, zone: string, reader = deviceTimezone()) {
  const at = new Date(instant);
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...zoneNote(at, zone, reader) }).format(at);
}
// Scannable variant for cards ("Thu, Nov 19, 7:40 AM"): drops the year.
export function rideTimeShort(instant: string, zone: string, reader = deviceTimezone()) {
  const at = new Date(instant);
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...zoneNote(at, zone, reader) }).format(at);
}
// Clock time only ("7:40 AM"), for lists already grouped by day.
export function rideClock(instant: string, zone: string, reader = deviceTimezone()) {
  const at = new Date(instant);
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit", ...zoneNote(at, zone, reader) }).format(at);
}
// "7:40 – 8:10 AM": the first AM/PM is dropped when both times share it.
export function rideClockRange(start: string, end: string, zone: string, reader = deviceTimezone()) {
  const from = rideClock(start, zone, reader), to = rideClock(end, zone, reader);
  // Engines differ on the space before AM/PM (plain or narrow no-break).
  const [clock, meridiem] = from.split(/\s/);
  return `${meridiem && to.split(/\s/)[1] === meridiem && !from.includes("GMT") ? clock : from} – ${to}`;
}
// "Sun, Nov 22 · 7:40 – 8:10 AM"
export function rideWhen(start: string, end: string, zone: string, reader = deviceTimezone()) {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", month: "short", day: "numeric" }).format(new Date(start));
  return `${day} · ${rideClockRange(start, end, zone, reader)}`;
}
export function rideDay(instant: string, zone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long", month: "long", day: "numeric" }).format(new Date(instant));
}
export function dateInZone(instant: Date, zone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: validTimezone(zone), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function addDays(date: string, count: number) {
  const day = localDate(date); day.setUTCDate(day.getUTCDate() + count); return day.toISOString().slice(0, 10);
}
// Calendar boundaries differ from entered ride times: a date may begin after
// midnight (or be skipped entirely). Find the first instant on/after that date.
function calendarDayStart(date: string, zone: string) {
  const nominal = localDate(date).getTime();
  validTimezone(zone);
  try { return zonedInstant(`${date}T00:00`, zone, "earlier"); }
  catch {
    // Midnight is in a gap. IANA transitions have second precision; searching
    // instants rather than local minutes also preserves sub-minute offsets.
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
    const dayAt = (seconds: number) => {
      const parts = Object.fromEntries(formatter.formatToParts(seconds * 1000).map((part) => [part.type, part.value]));
      return `${parts.year}-${parts.month}-${parts.day}`;
    };
    let before = nominal / 1000 - 48 * 3600;
    let after = nominal / 1000 + 48 * 3600;
    while (after - before > 1) {
      const middle = Math.floor((before + after) / 2);
      if (dayAt(middle) < date) before = middle;
      else after = middle;
    }
    return new Date(after * 1000).toISOString();
  }
}
// A run of whole calendar days starting at `start`, as instants.
export function daysRange(start: string, count: number, zone: string) {
  return { from: calendarDayStart(start, zone), until: calendarDayStart(addDays(start, count), zone) };
}
export function weekRange(date: string, zone: string) {
  const day = localDate(date);
  const monday = addDays(date, -((day.getUTCDay() + 6) % 7));
  return { monday, next: addDays(monday, 7), from: calendarDayStart(monday, zone), until: calendarDayStart(addDays(monday, 7), zone) };
}
