import type { Database } from "./supabase/database.types";
export type RideState = { error?: string; message?: string; path?: string };
export type RideOffer = Database["public"]["Functions"]["ride_offer"]["Returns"][number];
export function rideError(code: string) {
  switch (code) {
    case "PT401": return "Sign in with a confirmed email and try again.";
    case "PT404": return "This ride, family or child is unavailable to this account.";
    case "PT409": case "23505": return "This plan changed or was cancelled. Reload to see its current revision before trying again.";
    case "PT423": return "Resolve the driver proposal or assignment before changing riders. After pickup, the trip and responsibilities are frozen. Changed future plans require fresh consent.";
    case "PT400": case "23514": case "23503": return "Check the route, dates, timezone, family and selected children. Select only your own children and circle families.";
    default: return "We could not save this change. Your request may have reached the server; reload before retrying.";
  }
}
export function validTimezone(zone: string) {
  if (zone !== "UTC" && !zone.includes("/")) throw new Error("Use an IANA timezone such as America/Denver or UTC.");
  try { new Intl.DateTimeFormat("en", { timeZone: zone }).format(); }
  catch { throw new Error("Use a valid IANA timezone such as America/Denver or UTC."); }
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
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) || !["reject", "earlier", "later"].includes(occurrence)) throw new Error("Choose a valid local date and time.");
  localDate(local.slice(0, 10));
  if (Number(local.slice(11, 13)) > 23 || Number(local.slice(14, 16)) > 59) throw new Error("Choose a valid local time.");
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
  if (!instants.length) throw new Error("That local time does not exist because the clock moves forward. Choose another time.");
  if (instants.length > 1 && occurrence === "reject") throw new Error("That hour occurs twice because the clock moves back. Choose the earlier or later occurrence for this time.");
  return new Date(occurrence === "later" ? instants.at(-1)! : instants[0]).toISOString();
}
export function rideTime(instant: string, zone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "shortOffset" }).format(new Date(instant));
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
export function weekRange(date: string, zone: string) {
  const day = localDate(date);
  const monday = addDays(date, -((day.getUTCDay() + 6) % 7));
  return { monday, next: addDays(monday, 7), from: calendarDayStart(monday, zone), until: calendarDayStart(addDays(monday, 7), zone) };
}
