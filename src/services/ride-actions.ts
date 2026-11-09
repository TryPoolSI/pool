import { Fields, type CommandInput } from "./fields";

import { revalidatePath } from "@/services/cache";
import { createClient } from "@/lib/supabase/client";
import { verifiedUser } from "@/lib/auth/identity";
import { requiredText, uuid } from "@/lib/membership";
import { rideError, zonedInstant, type RideState } from "@/lib/rides";

function revision(data: Fields) {
  const value = requiredText(data, "revision", 10);
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) > 2147483646
  )
    throw new Error("validation");
  return Number(value);
}
function ids(data: Fields, name: string) {
  const values = data.getAll(name);
  if (
    values.length > 50 ||
    values.some(
      (id) =>
        typeof id !== "string" ||
        !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id),
    ) ||
    new Set(values).size !== values.length
  )
    throw new Error("validation");
  return values as string[];
}
function choice(data: Fields, name: string, choices: string[]) {
  const value = requiredText(data, name);
  if (!choices.includes(value)) throw new Error("validation");
  return value;
}
async function executeRide(
  _previous: RideState,
  data: Fields,
): Promise<RideState> {
  try {
    const client = await createClient();
    if (!(await verifiedUser(client))) return { error: rideError("PT401") };
    const command = requiredText(data, "command");
    const family = uuid(data, "family_id");
    let result: { data: unknown; error: { code: string } | null };
    let path: string | undefined;
    switch (command) {
      case "saveOwnChild":
        result = await client.rpc("save_own_child", {
          p_id: uuid(data, "child_id"),
          p_family_id: family,
          p_display_name: requiredText(data, "display_name"),
          p_seat_requirement: choice(data, "seat_requirement", [
            "standard",
            "booster",
            "child-seat",
          ]),
          p_revision: revision(data),
        });
        path = `/app/children?family=${family}`;
        break;
      case "createRide": {
        const zone = requiredText(data, "timezone", 100);
        let start: string, end: string;
        try {
          start = zonedInstant(
            requiredText(data, "starts_local"),
            zone,
            requiredText(data, "start_occurrence"),
          );
          end = zonedInstant(
            requiredText(data, "ends_local"),
            zone,
            requiredText(data, "end_occurrence"),
          );
        } catch (error) {
          return {
            error:
              error instanceof Error && error.message !== "validation"
                ? error.message
                : rideError("PT400"),
          };
        }
        if (end <= start)
          return { error: "Drop-off time must be after pickup time." };
        const children = ids(data, "child_ids");
        if (!children.length) throw new Error("validation");
        const id = uuid(data, "ride_id");
        result = await client.rpc("create_ride", {
          p_id: id,
          p_family_id: family,
          p_circle_id: uuid(data, "circle_id"),
          p_pickup_summary: requiredText(data, "pickup_summary"),
          p_destination_summary: requiredText(data, "destination_summary"),
          p_pickup: requiredText(data, "pickup", 300),
          p_destination: requiredText(data, "destination", 300),
          p_direction: choice(data, "direction", ["outbound", "return"]),
          p_starts_at: start,
          p_ends_at: end,
          p_timezone: zone,
          p_child_ids: children,
          p_invited_family_ids: ids(data, "invited_family_ids"),
        });
        path = `/app/rides/${id}`;
        break;
      }
      case "respondToRideInvitation": {
        const response = choice(data, "response", ["join", "decline"]);
        const children = ids(data, "child_ids");
        if (
          (response === "join" && !children.length) ||
          (response === "decline" && children.length)
        )
          throw new Error("validation");
        result = await client.rpc("respond_to_ride_invitation", {
          p_ride_id: uuid(data, "ride_id"),
          p_family_id: family,
          p_revision: revision(data),
          p_accept: response === "join",
          p_child_ids: children,
        });
        break;
      }
      case "setOwnRideRiders":
        result = await client.rpc("set_own_ride_riders", {
          p_ride_id: uuid(data, "ride_id"),
          p_family_id: family,
          p_revision: revision(data),
          p_child_ids: ids(data, "child_ids"),
        });
        break;
      case "cancelRide":
        if (data.get("confirm") !== "yes") throw new Error("validation");
        result = await client.rpc("cancel_ride", {
          p_ride_id: uuid(data, "ride_id"),
          p_family_id: family,
          p_revision: revision(data),
        });
        break;
      default:
        throw new Error("validation");
    }
    if (result.error) return { error: rideError(result.error.code) };
    revalidatePath("/app", "layout");
    return {
      message: "Saved. Reload any other open session to see the current plan.",
      path,
    };
  } catch (error) {
    return {
      error: rideError(
        error instanceof Error && error.message === "validation"
          ? "PT400"
          : "unknown",
      ),
    };
  }
}

export function rideAction(
  previous: Record<string, unknown>,
  input: CommandInput | Fields,
) {
  return executeRide(
    previous,
    input instanceof Fields ? input : new Fields(input),
  );
}
