import assert from "node:assert/strict";
import test from "node:test";
import { zonedInstant, weekRange, dateInZone, localDate } from "../src/lib/rides.ts";
test("ride wall times reject calendar errors and nonexistent spring times", () => {
  for (const value of ["2027-02-29", "2026-04-31", "2026-13-01", "bad"]) assert.throws(() => localDate(value));
  for (const value of ["2027-03-14T02:30", "2027-03-14T24:00", "2027-02-30T09:00"]) assert.throws(() => zonedInstant(value, "America/Denver"));
  assert.throws(() => zonedInstant("2027-04-01T09:00", "MST"));
  assert.throws(() => zonedInstant("2027-04-01T09:00", "Bogus/Zone"));
  assert.equal(zonedInstant("2027-03-14T03:00", "America/Denver"), "2027-03-14T09:00:00.000Z");
});
test("repeated hours require a choice and support non-hour DST offsets", () => {
  assert.throws(() => zonedInstant("2027-11-07T01:30", "America/Denver"), /occurs twice/);
  assert.equal(zonedInstant("2027-11-07T01:30", "America/Denver", "earlier"), "2027-11-07T07:30:00.000Z");
  assert.equal(zonedInstant("2027-11-07T01:30", "America/Denver", "later"), "2027-11-07T08:30:00.000Z");
  assert.equal(zonedInstant("2027-04-04T01:45", "Australia/Lord_Howe", "earlier"), "2027-04-03T14:45:00.000Z");
  assert.equal(zonedInstant("2027-04-04T01:45", "Australia/Lord_Howe", "later"), "2027-04-03T15:15:00.000Z");
  assert.equal(zonedInstant("2027-01-01T00:15", "Asia/Kathmandu"), "2026-12-31T18:30:00.000Z");
});
test("weekly range uses local Mondays with DST and year/date boundaries", () => {
  const spring = weekRange("2027-03-14", "America/Denver");
  assert.equal(spring.monday, "2027-03-08");
  assert.equal((Date.parse(spring.until) - Date.parse(spring.from)) / 3600000, 167);
  const autumn = weekRange("2027-11-07", "America/Denver");
  assert.equal((Date.parse(autumn.until) - Date.parse(autumn.from)) / 3600000, 169);
  assert.equal(weekRange("2027-01-01", "UTC").monday, "2026-12-28");
  assert.equal(dateInZone(new Date("2027-01-01T01:00:00Z"), "America/Denver"), "2026-12-31");
  assert.equal(dateInZone(new Date("2026-12-31T11:00:00Z"), "Pacific/Kiritimati"), "2027-01-01");
});

test("calendar weeks include dates with skipped Monday midnight in both adjacent weeks", () => {
  const after = weekRange("2021-03-23", "Asia/Tehran");
  const before = weekRange("2021-03-16", "Asia/Tehran");
  assert.equal(after.from, "2021-03-21T20:30:00.000Z");
  assert.equal(before.until, after.from);
  assert.equal(dateInZone(new Date(Date.parse(after.from) - 1000), "Asia/Tehran"), "2021-03-21");
  assert.equal(dateInZone(new Date(after.from), "Asia/Tehran"), "2021-03-22");
  assert.equal(after.until, "2021-03-28T19:30:00.000Z");
  // Calendar range resolution must never relax validation of entered ride times.
  for (const occurrence of ["reject", "earlier", "later"]) assert.throws(() => zonedInstant("2021-03-22T00:00", "Asia/Tehran", occurrence), /does not exist/);
});
