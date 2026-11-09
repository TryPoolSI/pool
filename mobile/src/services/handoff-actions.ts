import { Fields, type CommandInput } from "./fields";

import { revalidatePath } from "@/services/cache";
import { createClient } from "@/lib/supabase/client";
import { verifiedUser } from "@/lib/auth/identity";
import { requiredText, uuid } from "@/lib/membership";
import { handoffError, type HandoffState } from "@/lib/handoffs";
function integer(data: Fields, name: string, minimum: number) {
  const value = requiredText(data, name, 10);
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < minimum ||
    Number(value) > 2147483646
  )
    throw new Error("validation");
  return Number(value);
}
async function executeHandoff(
  _previous: HandoffState,
  data: Fields,
): Promise<HandoffState> {
  try {
    const client = await createClient();
    if (!(await verifiedUser(client))) return { error: handoffError("PT401") };
    const command = requiredText(data, "command");
    if (data.get("confirm") !== "yes") throw new Error("validation");
    const args = {
      p_ride_id: uuid(data, "ride_id"),
      p_child_id: uuid(data, "child_id"),
      p_revision: integer(data, "revision", 1),
      p_version: integer(
        data,
        "version",
        command === "designateRecipient" ? 0 : 1,
      ),
    };
    let result;
    if (command === "designateRecipient")
      result = await client.rpc("designate_recipient", {
        ...args,
        p_recipient_id: uuid(data, "recipient_id"),
      });
    else {
      const event = { ...args, p_request_id: uuid(data, "request_id") };
      switch (command) {
        case "recordPickup":
          result = await client.rpc("record_pickup", event);
          break;
        case "reportArrival":
          result = await client.rpc("report_arrival", event);
          break;
        case "confirmHandoff":
          result = await client.rpc("confirm_handoff", event);
          break;
        default:
          throw new Error("validation");
      }
    }
    if (result.error) return { error: handoffError(result.error.code) };
    revalidatePath("/app", "layout");
    return {
      message:
        command === "designateRecipient"
          ? "Designated guardian saved."
          : "Manual report saved. Refresh other sessions to see current progress.",
    };
  } catch (error) {
    return {
      error: handoffError(
        error instanceof Error && error.message === "validation"
          ? "PT400"
          : "unknown",
      ),
    };
  }
}

export function handoffAction(
  previous: Record<string, unknown>,
  input: CommandInput | Fields,
) {
  return executeHandoff(
    previous,
    input instanceof Fields ? input : new Fields(input),
  );
}
