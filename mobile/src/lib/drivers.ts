import type { Database } from "./supabase/database.types";
export type DriverState = { error?: string; message?: string; path?: string };
export type DriverStatus = Database["public"]["Functions"]["driver_status"]["Returns"][number];
export const coverageLabel = (coverage?: string) => coverage === "confirmed" ? "Confirmed" : coverage === "awaiting_confirmation" ? "Awaiting confirmation" : "Unassigned — needs a driver";
export function driverError(code: string) {
  switch (code) {
    case "PT401": return "Sign in with a confirmed email and try again.";
    case "PT404": return "This driver, proposal, vehicle or family is unavailable to this account.";
    case "PT409": case "23505": return "This proposal, vehicle or plan changed or was closed. Reload current data before trying again.";
    case "PT410": return "The reply deadline has passed. Reload to see current coverage; an optional swap preserves its available original driver.";
    case "PT422": return "All families must respond, enough passenger seats must be available, and the driver must acknowledge every required restraint.";
    case "PT423": return "Resolve the current proposal or assignment before changing this vehicle or roster. Before pickup, withdraw or revoke consent first for a confirmed assignment. After pickup, ordinary changes are unavailable.";
    case "PT424": case "23P01": return "This driver or vehicle is already reserved for an overlapping ride. No assignment was made; resolve the conflict and reply again.";
    case "PT400": case "23514": case "23503": return "Check the vehicle, seats and selected children. Consent is only for your own enrolled children.";
    default: return "We could not save this change. Your request may have reached the server; reload before retrying.";
  }
}

export function driverPageCursor(query: { after_start?: string; after_id?: string }) {
  if (!query.after_start && !query.after_id) return {};
  if (!query.after_start || query.after_start.length > 50 || !Number.isFinite(Date.parse(query.after_start)) || !query.after_id || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(query.after_id)) throw new Error("Invalid driving page. Open the first page and try again.");
  return { p_after_start:new Date(query.after_start).toISOString(),p_after_id:query.after_id };
}
export function driverNextPage(last: DriverStatus, pendingOnly: boolean) {
  const query = new URLSearchParams({ after_start:last.starts_at,after_id:last.ride_id });
  if (pendingOnly) query.set("pending","1");
  return `/app/driving?${query}`;
}
