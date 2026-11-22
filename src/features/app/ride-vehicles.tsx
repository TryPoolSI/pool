import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { newRequestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { useSession } from "@/services/session";
import * as UI from "@/ui/elements";
import { styles } from "@/ui/styles";
import { AddVehicleForm, DriverForm } from "./driver-form";

export type DriverOption =
  Database["public"]["Functions"]["driver_options"]["Returns"][number];
const plain = { marginVertical: 0 } as const;
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const optionValue = (option: DriverOption) =>
  [
    option.driver_id,
    option.driver_family_id,
    option.vehicle_id,
    option.vehicle_version,
  ].join("|");

// "Ask Alex to drive": one choice of person and car, one button. The same form
// asks for a first driver and asks someone to take over from the current one.
export function AskDriverForm(props: {
  command: "proposeDriver" | "requestReplacement";
  fields: Record<string, string>;
  options: DriverOption[];
  // What happens next, in one sentence, given the chosen driver's first name.
  outcome: (name: string) => string;
}) {
  // Each request gets its own id, so the sheet can be used again.
  const [attempt, setAttempt] = useState(0);
  return (
    <AskDriverFields
      key={attempt}
      {...props}
      onSent={() => setAttempt((count) => count + 1)}
    />
  );
}

function AskDriverFields({
  command,
  fields,
  options,
  outcome,
  onSent,
}: Parameters<typeof AskDriverForm>[0] & { onSent: () => void }) {
  const [requestId] = useState(newRequestId);
  const [selection, setSelection] = useState("");
  if (!options.length)
    return (
      <UI.Paragraph style={plain}>
        Nobody else in this circle has a car with a seat for every rider yet.
      </UI.Paragraph>
    );
  const chosen =
    options.find((option) => optionValue(option) === selection) ?? options[0];
  return (
    <DriverForm
      command={command}
      fields={{
        ...fields,
        proposal_id: requestId,
        driver_vehicle: optionValue(chosen),
      }}
      label={`Ask ${firstName(chosen.display_name)} to drive`}
      after="close"
      onResult={(result) => {
        if (!result.error) onSent();
      }}
    >
      {options.length > 1 ? (
        <UI.Label>
          Driver and car
          <UI.Select
            name="driver_choice"
            value={optionValue(chosen)}
            onChange={(event) => setSelection(event.target.value)}
          >
            {options.map((option) => (
              <UI.Option key={optionValue(option)} value={optionValue(option)}>
                {`${option.display_name} · ${option.vehicle_label} · ${option.passenger_seats} seats`}
              </UI.Option>
            ))}
          </UI.Select>
        </UI.Label>
      ) : (
        <UI.Paragraph style={plain}>
          {`${chosen.display_name} would drive the ${chosen.vehicle_label}.`}
        </UI.Paragraph>
      )}
      <UI.Paragraph style={[plain, styles.small]}>
        {outcome(firstName(chosen.display_name))}
      </UI.Paragraph>
    </DriverForm>
  );
}

// The driver switches to another of their own cars. Their yes goes with the
// request, so the switch is done in one step and the families are told.
export function RideVehicleChange({
  rideId,
  proposalId,
  revision,
  riderCount,
  proposedVehicleId,
  assignedVehicleId,
  needs = [],
  first = false,
}: {
  rideId: string;
  proposalId: string;
  revision: number;
  riderCount: number;
  proposedVehicleId: string;
  assignedVehicleId?: string;
  // Boosters and child seats these riders need, in words.
  needs?: string[];
  // The person was asked to drive and has not said yes: choosing a car is
  // their yes.
  first?: boolean;
}) {
  const { user } = useSession();
  const [requestId] = useState(newRequestId);
  const [selection, setSelection] = useState("");
  const [adding, setAdding] = useState(false);
  const [tooSmall, setTooSmall] = useState(false);
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
      if (error) throw new Error("Pool couldn’t load your cars.");
      return data;
    },
  });
  if (vehicles.isPending) return <UI.Loading />;
  if (vehicles.isError)
    return (
      <>
        <UI.Paragraph role="alert">
          Pool couldn’t load your cars. Check your connection and try again.
        </UI.Paragraph>
        <UI.Button onPress={() => void vehicles.refetch()}>Try again</UI.Button>
      </>
    );
  const eligible = vehicles.data.filter(
    (vehicle) =>
      vehicle.passenger_seats >= riderCount &&
      vehicle.id !== proposedVehicleId &&
      vehicle.id !== assignedVehicleId,
  );
  const chosen =
    eligible.find((vehicle) => vehicle.id === selection) ?? eligible[0];

  return (
    <>
      {chosen ? (
        <DriverForm
          command="requestRideVehicleChange"
          fields={{
            request_id: requestId,
            ride_id: rideId,
            proposal_id: proposalId,
            revision: String(revision),
            vehicle_selection: `${chosen.id}|${chosen.version}|${chosen.passenger_seats}`,
            // With no boosters or child seats needed there is nothing to confirm.
            ...(needs.length ? {} : { restraints: "yes" }),
            ...(first ? { first: "yes" } : {}),
          }}
          label={`Use the ${chosen.label}`}
          after="close"
        >
          {eligible.length > 1 && (
            <UI.Label>
              Car
              <UI.Select
                name="car_choice"
                value={chosen.id}
                onChange={(event) => setSelection(event.target.value)}
              >
                {eligible.map((vehicle) => (
                  <UI.Option key={vehicle.id} value={vehicle.id}>
                    {`${vehicle.label} · ${vehicle.passenger_seats} seats`}
                  </UI.Option>
                ))}
              </UI.Select>
            </UI.Label>
          )}
          {needs.length > 0 && (
            <UI.Label className="checkbox-label">
              <UI.Field
                type="checkbox"
                name="restraints"
                value="yes"
                required
              />
              {`I have ${needs.join(" and ")} in this car`}
            </UI.Label>
          )}
          <UI.Paragraph style={[plain, styles.small]}>
            {first
              ? "You’re the driver as soon as you tap. The families on this ride are told."
              : "The families on this ride will see the new car."}
          </UI.Paragraph>
        </DriverForm>
      ) : (
        <UI.Paragraph style={plain}>
          {tooSmall
            ? "That car doesn’t have a seat for every rider. Add a bigger one to switch."
            : "You don’t have another car with a seat for every rider. Add one to switch."}
        </UI.Paragraph>
      )}
      {adding ? (
        <>
          <AddVehicleForm
            after="inline"
            onVehicleSaved={({ id, passengerSeats }) => {
              setAdding(false);
              setTooSmall(passengerSeats < riderCount);
              if (passengerSeats >= riderCount) setSelection(id);
            }}
          />
          <UI.Button className="quiet" onPress={() => setAdding(false)}>
            Never mind
          </UI.Button>
        </>
      ) : (
        <UI.Button className="quiet" onPress={() => setAdding(true)}>
          Add another car
        </UI.Button>
      )}
    </>
  );
}
