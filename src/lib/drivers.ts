import type { Database } from "./supabase/database.types";
export type DriverState = { error?: string; message?: string; path?: string };
export type DriverStatus = Database["public"]["Functions"]["driver_status"]["Returns"][number];
// "1 booster", "2 child seats": what a driver has to bring for these riders.
export function seatNeeds({
  booster_count: boosters,
  child_seat_count: seats,
}: {
  booster_count: number;
  child_seat_count: number;
}) {
  return [
    boosters && `${boosters} ${boosters === 1 ? "booster" : "boosters"}`,
    seats && `${seats} ${seats === 1 ? "child seat" : "child seats"}`,
  ].filter(Boolean) as string[];
}
export function driverError(code: string) {
  switch (code) {
    case "PT401": return "Sign in again, then try once more.";
    case "PT404": return "That driver or car isn’t available for this ride anymore. Choose another.";
    case "PT409": case "23505": return "Someone else just changed this ride. You’re seeing the latest now, so try again.";
    case "PT410": return "The time to reply has passed. Ask again to line up a driver.";
    case "PT422": return "This car can’t take the ride. It needs a seat for every rider, plus any boosters or child seats they need.";
    case "PT423": return "This can’t change after the first pickup.";
    case "PT424": case "23P01": return "That driver or car is already on another ride at this time. Choose someone else.";
    case "PT400": case "23514": case "23503": return "Something here doesn’t fit. Check what you entered, then try again.";
    default: return "That didn’t go through. Check your connection and try again.";
  }
}

export function driverPageCursor(query: { after_start?: string; after_id?: string }) {
  if (!query.after_start && !query.after_id) return {};
  if (!query.after_start || query.after_start.length > 50 || !Number.isFinite(Date.parse(query.after_start)) || !query.after_id || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(query.after_id)) throw new Error("That page isn’t available. Go back to the first page and try again.");
  return { p_after_start:new Date(query.after_start).toISOString(),p_after_id:query.after_id };
}
export function driverNextPage(last: DriverStatus, pendingOnly: boolean) {
  const query = new URLSearchParams({ after_start:last.starts_at,after_id:last.ride_id });
  if (pendingOnly) query.set("pending","1");
  return `/app/driving?${query}`;
}
