import type { Database } from "./supabase/database.types";
export type HandoffState = { error?: string; message?: string };
export type Handoff = Database["public"]["Tables"]["ride_handoffs"]["Row"];
// One or two words per child: where they are in the trip.
export const progressLabel = (status?: string) => ({ scheduled: "Waiting", picked_up: "Picked up", awaiting_handoff: "Arrived", completed: "Handed off" })[status ?? "scheduled"] ?? "Waiting";
// Short enough for a toast.
export function handoffMessage(command: string) {
  switch (command) {
    case "recordPickup": return "Pickup confirmed";
    case "reportArrival": return "Arrived";
    case "confirmHandoff": return "Handed off";
    default: return "Saved";
  }
}
export function handoffError(code: string) {
  switch (code) {
    case "PT401": return "Sign in again, then try once more.";
    case "PT404": return "This step isn’t yours to confirm. The driver confirms pickup and arrival, and the person meeting the child confirms the handoff.";
    case "PT400": return "That didn’t go through. Try again.";
    case "PT409": case "23505": return "Someone else just updated this trip. You’re seeing the latest now, so try again.";
    case "PT422": return "Pickup can’t start yet. Each family has to say who meets their child at drop-off.";
    case "PT424": return "You or this car still have an unfinished trip. Finish its handoffs, then start this one.";
    case "PT423": return "This trip has started, so it can’t be changed.";
    default: return "That didn’t go through. Check your connection and try again.";
  }
}
