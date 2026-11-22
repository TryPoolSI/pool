import { Fields, type CommandInput } from "./fields";

import { queryClient, revalidatePath } from "@/services/cache";
import { createClient } from "@/lib/supabase/client";
import { verifiedUser } from "@/lib/auth/identity";
import { requiredText, uuid } from "@/lib/membership";
import {
  deviceTimezone,
  rideError,
  zonedInstant,
  type RideState,
} from "@/lib/rides";
import { meetOwnRiders } from "./meet-riders";
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
        ? "This child may already be saved. Check your family’s list."
        : "Someone else just changed this child. Close this and open it again to see the latest.",
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
      return "Check the child’s name and seat.";
    default:
      return adding
        ? "That didn’t go through. Your entries are still here, so try again."
        : "That didn’t go through. Check the child’s details and try again.";
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
    let result: {
      data: unknown;
      error: { code: string; message?: string } | null;
    };
    let path: string | undefined;
    let message = "Saved";
    // The ride and riders this guardian just put on it, to meet at drop-off.
    let meet: { ride: string; riders: string[] } | undefined;
    switch (command) {
      case "saveOwnChild":
        return await saveOwnChild(client, user.id, family.toLowerCase(), data);
      case "createRide": {
        // The planner sends one date and two clock times in the device's
        // timezone. Older callers may still send full local date-times.
        const zone = data.get("timezone")?.trim() || deviceTimezone();
        const date = data.get("date")?.trim();
        const local = (name: "starts" | "ends") =>
          data.get(`${name}_local`)?.trim() ||
          (date && data.get(`${name}_time`)
            ? `${date}T${data.get(`${name}_time`)!.trim()}`
            : "");
        if (!local("starts") || !local("ends"))
          return { error: "Choose a date, a pickup time and a drop-off time." };
        let start: string, end: string;
        try {
          start = zonedInstant(
            local("starts"),
            zone,
            data.get("start_occurrence")?.trim() || undefined,
          );
          end = zonedInstant(
            local("ends"),
            zone,
            data.get("end_occurrence")?.trim() || undefined,
          );
        } catch (error) {
          return {
            error:
              error instanceof Error && error.message !== "validation"
                ? error.message
                : "Choose a date, a pickup time and a drop-off time.",
          };
        }
        if (end <= start)
          return { error: "Drop-off has to be after pickup." };
        const children = ids(data, "child_ids");
        if (!children.length)
          return { error: "Choose at least one of your children to ride." };
        const id = uuid(data, "ride_id");
        const from = requiredText(data, "pickup_summary");
        const to = requiredText(data, "destination_summary");
        // Exact addresses are optional in the planner: without them the place
        // names stand in. The database needs the two to differ.
        const exactFrom = data.get("pickup")?.trim() || from;
        const exactTo = data.get("destination")?.trim() || to;
        if (exactFrom.toLowerCase() === exactTo.toLowerCase())
          return { error: "Pickup and drop-off need to be different places." };
        if (exactFrom.length > 300 || exactTo.length > 300)
          throw new Error("validation");
        result = await client.rpc("create_ride", {
          p_id: id,
          p_family_id: family,
          p_circle_id: uuid(data, "circle_id"),
          p_pickup_summary: from,
          p_destination_summary: to,
          p_pickup: exactFrom,
          p_destination: exactTo,
          p_direction: choice(data, "direction", ["outbound", "return"]),
          p_starts_at: start,
          p_ends_at: end,
          p_timezone: zone,
          p_child_ids: children,
          p_invited_family_ids: ids(data, "invited_family_ids"),
        });
        path = `/app/rides/${id}`;
        message = "Ride created";
        meet = { ride: id, riders: children };
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
        message = response === "join" ? "You’re in" : "Ride declined";
        meet = { ride: uuid(data, "ride_id"), riders: children };
        break;
      }
      case "setOwnRideRiders":
        result = await client.rpc("set_own_ride_riders", {
          p_ride_id: uuid(data, "ride_id"),
          p_family_id: family,
          p_revision: revision(data),
          p_child_ids: ids(data, "child_ids"),
        });
        message = "Riders updated";
        meet = { ride: uuid(data, "ride_id"), riders: ids(data, "child_ids") };
        break;
      case "cancelRide":
        if (data.get("confirm") !== "yes") throw new Error("validation");
        result = await client.rpc("cancel_ride", {
          p_ride_id: uuid(data, "ride_id"),
          p_family_id: family,
          p_revision: revision(data),
        });
        message = "Ride cancelled";
        break;
      default:
        throw new Error("validation");
    }
    // No refetch on a conflict here: these forms are keyed by the ride's
    // revision, so fresh data would remount them and drop this message. The
    // 20-second refresh brings the latest plan.
    if (result.error) {
      // The driver's car is the limit once a driver is set.
      if (result.error.message === "car_full")
        return {
          error:
            "The driver’s car doesn’t have a seat for everyone. Ask the driver to switch cars, or ask someone with a bigger car to take over.",
        };
      return { error: rideError(result.error.code) };
    }
    if (meet) await meetOwnRiders(client, user.id, meet.ride, family, meet.riders);
    revalidatePath("/app", "layout");
    return { message, path };
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
