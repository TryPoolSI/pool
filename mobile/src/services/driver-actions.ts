import { Fields, type CommandInput } from "./fields";

import { revalidatePath } from "@/services/cache";
import { createClient } from "@/lib/supabase/client";
import { verifiedUser } from "@/lib/auth/identity";
import { requiredText, uuid } from "@/lib/membership";
import { driverError, type DriverState } from "@/lib/drivers";
function integer(data: Fields, name: string, min: number, max = 2147483646) {
  const value = requiredText(data, name, 10);
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < min ||
    Number(value) > max
  )
    throw new Error("validation");
  return Number(value);
}
function children(data: Fields) {
  const values = data.getAll("child_ids");
  if (
    !values.length ||
    values.length > 50 ||
    new Set(values).size !== values.length ||
    values.some(
      (v) =>
        typeof v !== "string" ||
        !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v),
    )
  )
    throw new Error("validation");
  return values as string[];
}
async function executeDriver(
  _previous: DriverState,
  data: Fields,
): Promise<DriverState> {
  try {
    const client = await createClient();
    if (!(await verifiedUser(client))) return { error: driverError("PT401") };
    const command = requiredText(data, "command");
    let result: { data: unknown; error: { code: string } | null };
    let path: string | undefined;
    if (command === "saveVehicle") {
      const retire = data.get("retire") === "yes";
      if (retire && data.get("confirm") !== "yes")
        throw new Error("validation");
      result = await client.rpc("save_vehicle", {
        p_id: uuid(data, "vehicle_id"),
        p_label: requiredText(data, "label"),
        p_passenger_seats: integer(data, "passenger_seats", 1, 50),
        p_version: integer(data, "version", 0),
        p_retire: retire,
      });
      path = "/app/vehicles";
    } else if (
      command === "proposeDriver" ||
      command === "requestReplacement"
    ) {
      // A single selected option binds adult, membership context, vehicle and version.
      const selection = requiredText(data, "driver_vehicle", 160).split("|");
      if (selection.length !== 4) throw new Error("validation");
      const selected = new Fields();
      [
        "driver_id",
        "driver_family_id",
        "vehicle_id",
        "vehicle_version",
      ].forEach((key, index) => selected.set(key, selection[index]));
      if (data.get("confirm") !== "yes") throw new Error("validation");
      const ride = uuid(data, "ride_id");
      const nomination = {
        p_id: uuid(data, "proposal_id"),
        p_ride_id: ride,
        p_family_id: uuid(data, "family_id"),
        p_revision: integer(data, "revision", 1),
        p_driver_id: uuid(selected, "driver_id"),
        p_driver_family_id: uuid(selected, "driver_family_id"),
        p_vehicle_id: uuid(selected, "vehicle_id"),
        p_vehicle_version: integer(selected, "vehicle_version", 1),
      };
      if (command === "requestReplacement") {
        const deadline = requiredText(data, "deadline", 50);
        if (
          !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?Z$/.test(
            deadline,
          ) ||
          !Number.isFinite(Date.parse(deadline))
        )
          throw new Error("validation");
        const mode = requiredText(data, "mode");
        if (mode !== "optional_swap" && mode !== "unavailable")
          throw new Error("validation");
        result = await client.rpc("request_replacement", {
          ...nomination,
          p_mode: mode,
          p_deadline: new Date(deadline).toISOString(),
          p_original_assignment_id: uuid(data, "original_assignment_id"),
          p_original_assignment_revision: integer(
            data,
            "original_assignment_revision",
            1,
          ),
        });
      } else result = await client.rpc("propose_driver", nomination);
      path = `/app/rides/${ride}`;
    } else {
      const args = {
        p_id: uuid(data, "proposal_id"),
        p_revision: integer(data, "revision", 1),
      };
      switch (command) {
        case "acceptDriverProposal":
          if (data.get("restraints") !== "yes" || data.get("confirm") !== "yes")
            throw new Error("validation");
          result = await client.rpc("accept_driver_proposal", {
            ...args,
            p_available_seats: integer(data, "available_seats", 1, 50),
            p_restraints: true,
          });
          break;
        case "consentForOwnChildren":
          if (data.get("confirm") !== "yes") throw new Error("validation");
          result = await client.rpc("consent_for_own_children", {
            ...args,
            p_family_id: uuid(data, "family_id"),
            p_child_ids: children(data),
          });
          break;
        case "revokeOwnConsent":
          if (data.get("confirm") !== "yes") throw new Error("validation");
          result = await client.rpc("revoke_own_consent", {
            ...args,
            p_family_id: uuid(data, "family_id"),
            p_child_ids: children(data),
          });
          break;
        case "declineDriverProposal":
          result = await client.rpc("decline_driver_proposal", args);
          break;
        case "cancelDriverProposal":
          if (data.get("confirm") !== "yes") throw new Error("validation");
          result = await client.rpc("cancel_driver_proposal", {
            ...args,
            p_family_id: uuid(data, "family_id"),
          });
          break;
        case "withdrawDriver":
          if (data.get("confirm") !== "yes") throw new Error("validation");
          result = await client.rpc("withdraw_driver", args);
          break;
        default:
          throw new Error("validation");
      }
    }
    if (result.error) return { error: driverError(result.error.code) };
    revalidatePath("/app", "layout");
    return {
      message:
        result.data === "confirmed"
          ? "Confirmed. Every required consent and driver acceptance is saved."
          : "Saved. Reload other sessions to see the current assignment.",
      path,
    };
  } catch (error) {
    return {
      error: driverError(
        error instanceof Error && error.message === "validation"
          ? "PT400"
          : "unknown",
      ),
    };
  }
}

export function driverAction(
  previous: Record<string, unknown>,
  input: CommandInput | Fields,
) {
  return executeDriver(
    previous,
    input instanceof Fields ? input : new Fields(input),
  );
}
