import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { newRequestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { useSession } from "@/services/session";
import * as UI from "@/ui/elements";
import { AddVehicleForm, Confirmation, DriverForm } from "./driver-form";

type DriverOption =
  Database["public"]["Functions"]["driver_options"]["Returns"][number];

function AddRideVehicle({
  riderCount,
  onSelected,
}: {
  riderCount: number;
  onSelected: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <>
      {adding ? (
        <>
          <AddVehicleForm
            onVehicleSaved={({ id, passengerSeats }) => {
              setAdding(false);
              if (passengerSeats >= riderCount) {
                onSelected(id);
                setMessage("Car added.");
              } else {
                setMessage("Car added. It has too few passenger seats for this ride.");
              }
            }}
          />
          <UI.Button onPress={() => setAdding(false)}>Close vehicle form</UI.Button>
        </>
      ) : (
        <UI.Button onPress={() => setAdding(true)}>Add a car</UI.Button>
      )}
      {message && <UI.Paragraph role="status">{message}</UI.Paragraph>}
    </>
  );
}

const nominationValue = (option: DriverOption) =>
  [
    option.driver_id,
    option.driver_family_id,
    option.vehicle_id,
    option.vehicle_version,
  ].join("|");

export function RideDriverNomination({
  fields,
  options,
  riderCount,
}: {
  fields: Record<string, string>;
  options: DriverOption[];
  riderCount: number;
}) {
  const { user } = useSession();
  const [requestId] = useState(newRequestId);
  const [selection, setSelection] = useState("");
  const [addedId, setAddedId] = useState<string | null>(null);
  const eligible = options.filter((option) => option.passenger_seats >= riderCount);
  const addedOption = addedId && eligible.find(
    (option) => option.vehicle_id === addedId && option.driver_id === user?.id,
  );
  const selectedOption = addedOption || eligible.find(
    (option) => nominationValue(option) === selection,
  );

  return (
    <>
      <AddRideVehicle riderCount={riderCount} onSelected={setAddedId} />
      {eligible.length ? (
        <DriverForm
          command="proposeDriver"
          fields={{ ...fields, proposal_id: requestId }}
          label="Nominate driver"
        >
          <UI.Label>
            Driver and registered vehicle
            <UI.Select
              name="driver_vehicle"
              required
              value={selectedOption ? nominationValue(selectedOption) : ""}
              onChange={(event) => {
                setAddedId(null);
                setSelection(event.target.value);
              }}
            >
              <UI.Option value="" disabled>Choose a circle adult and vehicle</UI.Option>
              {eligible.map((option) => (
                <UI.Option key={nominationValue(option)} value={nominationValue(option)}>
                  {option.display_name} · {option.vehicle_label} ·{" "}
                  {option.passenger_seats} passenger seats
                </UI.Option>
              ))}
            </UI.Select>
          </UI.Label>
          <Confirmation>
            I nominate this adult and vehicle for this ride’s current riders and plan.
          </Confirmation>
        </DriverForm>
      ) : (
        <UI.Paragraph>No registered vehicles have enough seats for this ride.</UI.Paragraph>
      )}
    </>
  );
}

export function RideVehicleChange({
  rideId,
  proposalId,
  revision,
  riderCount,
  proposedVehicleId,
  assignedVehicleId,
}: {
  rideId: string;
  proposalId: string;
  revision: number;
  riderCount: number;
  proposedVehicleId: string;
  assignedVehicleId?: string;
}) {
  const { user } = useSession();
  const [requestId] = useState(newRequestId);
  const [selection, setSelection] = useState("");
  const [addedId, setAddedId] = useState<string | null>(null);
  const vehicles = useQuery({
    queryKey: ["account", user?.id, "active-driver-vehicles"],
    enabled: Boolean(user),
    queryFn: async ({ signal }) => {
      const { data, error } = await createClient()
        .from("vehicles")
        .select("id,label,passenger_seats,version")
        .eq("driver_id", user!.id)
        .is("retired_at", null)
        .order("label")
        .abortSignal(signal);
      if (error) throw new Error("Your cars could not be loaded.");
      return data;
    },
  });
  const eligible = vehicles.data?.filter(
    (vehicle) =>
      vehicle.passenger_seats >= riderCount &&
      vehicle.id !== proposedVehicleId &&
      vehicle.id !== assignedVehicleId,
  ) ?? [];
  const added = eligible.find((vehicle) => vehicle.id === addedId);
  const selectedVehicle = added ?? eligible.find(
    (vehicle) => `${vehicle.id}|${vehicle.version}` === selection,
  );

  return (
    <UI.Section>
      <UI.Heading3>Use a different car</UI.Heading3>
      <AddRideVehicle riderCount={riderCount} onSelected={setAddedId} />
      {vehicles.isError && (
        <>
          <UI.Paragraph role="alert">Your cars could not be loaded.</UI.Paragraph>
          <UI.Button onPress={() => void vehicles.refetch()}>Retry cars</UI.Button>
        </>
      )}
      {eligible.length ? (
        <DriverForm
          command="requestRideVehicleChange"
          fields={{
            request_id: requestId,
            ride_id: rideId,
            proposal_id: proposalId,
            revision: String(revision),
          }}
          label="Request car change"
        >
          <UI.Label>
            Different car
            <UI.Select
              name="vehicle_selection"
              required
              value={selectedVehicle ? `${selectedVehicle.id}|${selectedVehicle.version}` : ""}
              onChange={(event) => {
                setAddedId(null);
                setSelection(event.target.value);
              }}
            >
              <UI.Option value="" disabled>Choose one of your cars</UI.Option>
              {eligible.map((vehicle) => (
                <UI.Option key={vehicle.id} value={`${vehicle.id}|${vehicle.version}`}>
                  {vehicle.label} · {vehicle.passenger_seats} passenger seats
                </UI.Option>
              ))}
            </UI.Select>
          </UI.Label>
          <Confirmation>
            I request this car for the ride. The driver and every participating family must approve again.
          </Confirmation>
        </DriverForm>
      ) : vehicles.isSuccess && (
        <UI.Paragraph>No other registered cars have enough seats for this ride.</UI.Paragraph>
      )}
    </UI.Section>
  );
}
