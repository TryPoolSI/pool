import type { Database } from "./supabase/database.types";
export type HandoffState = { error?: string; message?: string };
export type Handoff = Database["public"]["Tables"]["ride_handoffs"]["Row"];
export const progressLabel = (status?: string) => ({ scheduled: "Scheduled", picked_up: "Picked up", awaiting_handoff: "Awaiting guardian receipt", completed: "Handoff completed" })[status ?? "scheduled"] ?? "Scheduled";
export function handoffError(code: string) {
  switch (code) {
    case "PT401": return "Sign in with a confirmed email and try again.";
    case "PT404": return "This child, trip or action is unavailable to this account.";
    case "PT400": return "Check the required confirmation and form values.";
    case "PT409": case "23505": return "The plan or child’s progress changed. Reload current data before trying again.";
    case "PT422": return "Before pickup, every child needs a valid designated guardian recipient, current consent and sufficient vehicle capacity.";
    case "PT424": return "This driver or vehicle is still responsible for another unfinished trip. Complete every handoff before starting another ride.";
    case "PT423": return "This trip has started. Its plan and responsibility are frozen; ordinary changes are unavailable.";
    default: return "We could not save this report. Reload current data and try again.";
  }
}
