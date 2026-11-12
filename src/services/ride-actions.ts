import { Fields, type CommandInput } from "./fields";

import { queryClient, revalidatePath } from "@/services/cache";
import { createClient } from "@/lib/supabase/client";
import { verifiedUser } from "@/lib/auth/identity";
import { requiredText, uuid } from "@/lib/membership";
import { rideError, zonedInstant, type RideState } from "@/lib/rides";
import {
  compareChildren,
  familyChildrenKey,
  seatRequirements,
  type FamilyChild,
} from "./family-children";

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

async function saveOwnChild(
  client: ReturnType<typeof createClient>,
  userId: string,
  familyId: string,
  data: Fields,
): Promise<RideState> {
  const expectedRevision = revision(data);
  const adding = expectedRevision === 0;
  const id = uuid(data, "child_id").toLowerCase();
  const displayName = requiredText(data, "display_name");
  const seat = choice(data, "seat_requirement", Object.keys(seatRequirements));
  const result = await client.rpc("save_own_child", {
    p_id: id,
    p_family_id: familyId,
    p_display_name: displayName,
    p_seat_requirement: seat,
    p_revision: expectedRevision,
  });
  const queryKey = familyChildrenKey(userId, familyId);
  if (result.error?.code === "PT409") {
    void queryClient.invalidateQueries({ queryKey, exact: true });
    return {
      error: adding
        ? "This draft conflicts with a saved child. Check your family’s roster."
        : "This child’s details changed. Review the roster and reopen the editor to use the latest details.",
    };
  }
  if (result.error) return { error: childSaveError(result.error.code, adding) };
  if (result.data !== id) return { error: childSaveError("unknown", adding) };

  const saved: FamilyChild = {
    id,
    display_name: displayName,
    seat_requirement: seat,
    revision: expectedRevision + 1,
  };
  await queryClient.cancelQueries({ queryKey, exact: true });
  queryClient.setQueryData<FamilyChild[]>(queryKey, (children) => {
    if (
      !children ||
      children.some((child) => child.id === id && child.revision > saved.revision)
    )
      return children;
    return [...children.filter((child) => child.id !== id), saved].sort(
      compareChildren,
    );
  });
  void queryClient.invalidateQueries({ queryKey: ["account", userId] });
  return { message: adding ? "Child added" : "Child updated" };
}

function childSaveError(code: string, adding: boolean) {
  switch (code) {
    case "PT401":
    case "PT404":
      return rideError(code);
    case "PT400":
    case "23514":
      return "Check the child’s display name and seat requirement.";
    default:
      return adding
        ? "Pool could not confirm the save. Retry with the same details."
        : "Pool could not confirm the update. Refresh the roster to check the child’s details.";
  }
}

async function executeRide(
  _previous: RideState,
  data: Fields,
): Promise<RideState> {
  const savingChild = data.get("command") === "saveOwnChild";
  try {
    const client = await createClient();
    const user = await verifiedUser(client);
    if (!user) return { error: rideError("PT401") };
    const command = requiredText(data, "command");
    const family = uuid(data, "family_id");
    let result: { data: unknown; error: { code: string } | null };
    let path: string | undefined;
    switch (command) {
      case "saveOwnChild":
        return await saveOwnChild(client, user.id, family.toLowerCase(), data);
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
    const code =
      error instanceof Error && error.message === "validation"
        ? "PT400"
        : "unknown";
    return {
      error: savingChild
        ? childSaveError(code, data.get("revision") === "0")
        : rideError(code),
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
