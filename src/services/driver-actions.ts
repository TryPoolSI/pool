import { Fields, type CommandInput } from "./fields";

import { revalidatePath } from "@/services/cache";
import { createClient } from "@/lib/supabase/client";
import { verifiedUser } from "@/lib/auth/identity";
import { requiredText, uuid } from "@/lib/membership";
import { driverError, type DriverState } from "@/lib/drivers";
type SavedVehicle = { id: string; passengerSeats: number };

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
async function executeDriver(
  _previous: DriverState,
  data: Fields,
  onVehicleSaved?: (vehicle: SavedVehicle) => void | Promise<void>,
): Promise<DriverState> {
  try {
    const client = await createClient();
    const user = await verifiedUser(client);
    if (!user) return { error: driverError("PT401") };
    const command = requiredText(data, "command");
    let result: {
      data: unknown;
      error: { code: string; message: string } | null;
    };
    let path: string | undefined;
    let message = "Saved";
    let savedVehicle: SavedVehicle | undefined;
    let vehicleMessage: string | undefined;
    if (command === "saveVehicle") {
      const retire = data.get("retire") === "yes";
      if (retire && data.get("confirm") !== "yes")
        throw new Error("validation");
      const id = uuid(data, "vehicle_id");
      const passengerSeats = integer(data, "passenger_seats", 1, 50);
      const label = requiredText(data, "label");
      const version = integer(data, "version", 0);
      result = await client.rpc("save_vehicle", {
        p_id: id,
        p_label: label,
        p_passenger_seats: passengerSeats,
        p_version: version,
        p_retire: retire,
      });
      vehicleMessage = retire
        ? `${label} removed`
        : version === 0
          ? `${label} added`
          : `${label} saved`;
      if (!retire) savedVehicle = { id, passengerSeats };
      // A car that is asked for, or set, on a ride stays as it is.
      if (result.error?.message === "vehicle_in_use")
        return {
          error:
            "This car is on a ride. Use a different car for that ride first.",
        };
      path = "/app/vehicles";
    } else if (command === "requestRideVehicleChange") {
      const selection = requiredText(data, "vehicle_selection", 60).split("|");
      // "car|version", or "car|version|seats" when the driver's yes goes with it.
      if (selection.length !== 2 && selection.length !== 3)
        throw new Error("validation");
      const selected = new Fields({
        vehicle_id: selection[0],
        vehicle_version: selection[1],
        seats: selection[2],
      });
      const ride = uuid(data, "ride_id");
      const request = uuid(data, "request_id");
      const revision = integer(data, "revision", 1);
      result = await client.rpc("request_ride_vehicle_change", {
        p_id: request,
        p_proposal_id: uuid(data, "proposal_id"),
        p_revision: revision,
        p_vehicle_id: uuid(selected, "vehicle_id"),
        p_vehicle_version: integer(selected, "vehicle_version", 1),
      });
      // The driver chose this car, so their own yes goes with the request and
      // the switch is done in one step.
      let switched = false;
      if (
        !result.error &&
        selection.length === 3 &&
        data.get("restraints") === "yes"
      ) {
        const accepted = await client.rpc("accept_driver_proposal", {
          p_id: request,
          p_revision: revision,
          p_available_seats: integer(selected, "seats", 1, 50),
          p_restraints: true,
        });
        switched = accepted.data === "confirmed";
      }
      // Someone who was only asked becomes the driver by choosing a car.
      message = !switched
        ? "Finish the car change on the ride"
        : data.get("first") === "yes"
          ? "You’re driving"
          : "Car changed";
      path = `/app/rides/${ride}`;
    } else if (command === "offerToDrive") {
      const ride = uuid(data, "ride_id");
      const request = uuid(data, "request_id");
      const family = uuid(data, "family_id");
      const revision = integer(data, "revision", 1);
      result = await client.rpc("offer_to_drive", {
        p_id: request,
        p_ride_id: ride,
        p_family_id: family,
        p_revision: revision,
        p_vehicle_id: uuid(data, "vehicle_id"),
        p_vehicle_version: integer(data, "vehicle_version", 1),
        p_available_seats: integer(data, "available_seats", 1, 50),
        p_restraints: data.get("restraints") === "yes",
      });
      if (result.error?.message === "already_assigned_or_pending") {
        return {
          error: "Someone is already lined up to drive this ride. Open it to see who.",
        };
      }
      if (
        result.error?.message === "insufficient_seats" ||
        result.error?.message === "capacity_or_restraints"
      ) {
        return {
          error: "This car can’t take every rider, or the boosters and child seats aren’t confirmed.",
        };
      }
      if (result.error?.message === "driver_unavailable") {
        return {
          error: "You’re already driving another ride at that time.",
        };
      }
      if (!result.error) {
        // The driver's own yes sets the ride. The families on it are told.
        revalidatePath();
        return { path: `/app/rides/${ride}`, message: "You’re driving" };
      }
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
      if (
        result.error?.message === "already_assigned_or_pending" ||
        result.error?.message === "pending_request"
      ) {
        // Show who it is instead of leaving this request on screen.
        revalidatePath();
        return {
          error: "Someone else was just lined up to drive. You’re seeing the latest.",
        };
      }
      message = "Request sent";
      path = `/app/rides/${ride}`;
    } else {
      const args = {
        p_id: uuid(data, "proposal_id"),
        p_revision: integer(data, "revision", 1),
      };
      switch (command) {
        case "acceptDriverProposal":
          if (data.get("restraints") !== "yes") throw new Error("validation");
          result = await client.rpc("accept_driver_proposal", {
            ...args,
            p_available_seats: integer(data, "available_seats", 1, 50),
            p_restraints: true,
          });
          message = result.data === "confirmed" ? "You’re driving" : "Reply sent";
          break;
        case "declineDriverProposal":
          result = await client.rpc("decline_driver_proposal", args);
          message = "Reply sent";
          break;
        case "cancelDriverProposal":
          result = await client.rpc("cancel_driver_proposal", {
            ...args,
            p_family_id: uuid(data, "family_id"),
          });
          message = "Request cancelled";
          break;
        case "withdrawDriver":
          result = await client.rpc("withdraw_driver", args);
          message = "You’re off this ride";
          break;
        default:
          throw new Error("validation");
      }
    }
    if (result.error) {
      // Someone else got there first: refresh so the stale choice goes away.
      if (result.error.code === "PT409" || result.error.code === "23505")
        revalidatePath();
      return { error: driverError(result.error.code) };
    }
    if (savedVehicle) await onVehicleSaved?.(savedVehicle);
    revalidatePath("/app", "layout");
    return { message: vehicleMessage ?? message, path };
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
  onVehicleSaved?: (vehicle: SavedVehicle) => void | Promise<void>,
) {
  return executeDriver(
    previous,
    input instanceof Fields ? input : new Fields(input),
    onVehicleSaved,
  );
}
