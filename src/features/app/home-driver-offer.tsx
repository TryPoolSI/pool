import { useState } from "react";
import { newRequestId } from "@/lib/request-id";
import type { Database } from "@/lib/supabase/database.types";
import { driverAction } from "@/services/driver-actions";
import { CommandForm } from "@/ui/command-form";
import * as UI from "@/ui/elements";
import { ActionDialog } from "./action-dialog";
import { AddVehicleForm } from "./driver-form";

export type OfferDetails =
  Database["public"]["Functions"]["drive_offer_details"]["Returns"][number];
export type OfferCar = Pick<
  Database["public"]["Tables"]["vehicles"]["Row"],
  "id" | "label" | "passenger_seats" | "version"
>;

function seatNeeds({ booster_count: boosters, child_seat_count: seats }: OfferDetails) {
  return [
    boosters && `${boosters} ${boosters === 1 ? "booster" : "boosters"}`,
    seats && `${seats} ${seats === 1 ? "child seat" : "child seats"}`,
  ].filter(Boolean) as string[];
}

// Offering to drive is one decision: "yes, in this car". Pool already knows
// the riders and the car's seats, so the sheet asks only what it cannot know.
export function HomeDriverOffer({
  details,
  riderCount,
  familyId,
  cars,
  rideLabel,
  primary = false,
}: {
  details?: OfferDetails;
  // Pool sends no offer details to an adult with no car, or with no car big
  // enough. The rider count alone still lets the card say which it is.
  riderCount?: number;
  familyId: string;
  cars: OfferCar[];
  rideLabel: string;
  primary?: boolean;
}) {
  const riders = details?.rider_count ?? riderCount;
  if (riders === undefined) return null;
  const eligible = cars.filter((car) => car.passenger_seats >= riders);
  if (!cars.length)
    return (
      <ActionDialog title="Add your car" triggerLabel="Add a car to drive">
        <UI.Paragraph>
          Add the car you’d drive, then you can offer to take this ride.
        </UI.Paragraph>
        <AddVehicleForm />
      </ActionDialog>
    );
  if (!eligible.length)
    return (
      <UI.Small>
        {`This ride has ${riders} riders, more than your car seats.`}
      </UI.Small>
    );
  if (!details) return null;
  return (
    <ActionDialog
      title="I’ll drive"
      tone={primary ? "primary" : "secondary"}
    >
      <OfferForm
        details={details}
        familyId={familyId}
        cars={eligible}
        rideLabel={rideLabel}
      />
    </ActionDialog>
  );
}

function OfferForm({
  details,
  familyId,
  cars,
  rideLabel,
}: {
  details: OfferDetails;
  familyId: string;
  cars: OfferCar[];
  rideLabel: string;
}) {
  const [requestId] = useState(newRequestId);
  const [car, setCar] = useState(cars[0]);
  const riders = details.rider_count;
  const needs = seatNeeds(details);
  return (
    <>
      <UI.Paragraph style={{ marginTop: 0 }}>
        {rideLabel}
        {"\n"}
        {riders === 1 ? "1 rider" : `${riders} riders`}
        {needs.length ? ` · needs ${needs.join(" and ")}` : ""}
      </UI.Paragraph>
      <CommandForm
        action={(fields) => driverAction({}, fields)}
        fields={{
          command: "offerToDrive",
          request_id: requestId,
          ride_id: details.ride_id,
          family_id: familyId,
          revision: String(details.ride_revision),
          vehicle_id: car.id,
          vehicle_version: String(car.version),
          // The whole car is offered; nobody needs to count seats.
          available_seats: String(car.passenger_seats),
          // With no boosters or child seats needed there is nothing to confirm.
          ...(needs.length ? {} : { restraints: "yes" }),
        }}
        label="I’ll drive"
        after="close"
      >
        {cars.length > 1 ? (
          <UI.Label>
            Car
            <UI.Select
              name="car_choice"
              value={car.id}
              onChange={(event) => {
                const selected = cars.find(
                  (option) => option.id === event.target.value,
                );
                if (selected) setCar(selected);
              }}
            >
              {cars.map((option) => (
                <UI.Option key={option.id} value={option.id}>
                  {`${option.label} · ${option.passenger_seats} seats`}
                </UI.Option>
              ))}
            </UI.Select>
          </UI.Label>
        ) : (
          <UI.Paragraph style={{ marginVertical: 0 }}>
            {`You’ll drive the ${car.label}.`}
          </UI.Paragraph>
        )}
        {needs.length > 0 && (
          <UI.Label className="checkbox-label">
            <UI.Field type="checkbox" name="restraints" value="yes" required />
            {`I have ${needs.join(" and ")}`}
          </UI.Label>
        )}
        <UI.Paragraph style={{ marginVertical: 0, fontSize: 14 }}>
          You’re the driver as soon as you tap. The families on this ride are
          told.
        </UI.Paragraph>
      </CommandForm>
    </>
  );
}
