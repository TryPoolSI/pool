import { useState } from "react";
import { newRequestId } from "@/lib/request-id";
import type { Database } from "@/lib/supabase/database.types";
import { driverAction } from "@/services/driver-actions";
import { CommandForm } from "@/ui/command-form";
import * as UI from "@/ui/elements";

export type OfferDetails =
  Database["public"]["Functions"]["drive_offer_details"]["Returns"][number];
export type OfferCar = Pick<
  Database["public"]["Tables"]["vehicles"]["Row"],
  "id" | "label" | "passenger_seats" | "version"
>;

export function HomeDriverOffer({
  details,
  familyId,
  cars,
}: {
  details?: OfferDetails;
  familyId: string;
  cars: OfferCar[];
}) {
  const [draft, setDraft] = useState<{
    details: OfferDetails;
    familyId: string;
    cars: OfferCar[];
  } | null>(null);
  const eligible = details
    ? cars.filter((car) => car.passenger_seats >= details.rider_count)
    : [];

  if (draft) return <OfferForm {...draft} onClose={() => setDraft(null)} />;
  if (!details || !eligible.length) return null;
  return (
    <UI.Button
      onPress={() => setDraft({ details, familyId, cars: eligible })}
    >
      I can drive
    </UI.Button>
  );
}

function OfferForm({
  details,
  familyId,
  cars,
  onClose,
}: {
  details: OfferDetails;
  familyId: string;
  cars: OfferCar[];
  onClose: () => void;
}) {
  const [requestId] = useState(newRequestId);
  const [car, setCar] = useState(cars[0]);
  const {
    rider_count: riders,
    booster_count: boosters,
    child_seat_count: childSeats,
  } = details;
  return (
    <UI.Box>
      <UI.Paragraph>
        {riders === 1 ? "1 rider needs a seat." : `${riders} riders need seats.`}
      </UI.Paragraph>
      <UI.Paragraph>
        Required restraints: {boosters} booster {boosters === 1 ? "seat" : "seats"}
        {" · "}{childSeats} child {childSeats === 1 ? "seat" : "seats"}
      </UI.Paragraph>
      <CommandForm
        action={(fields) => driverAction({}, fields)}
        fields={{
          command: "offerToDrive",
          request_id: requestId,
          ride_id: details.ride_id,
          family_id: familyId,
          revision: String(details.ride_revision),
          vehicle_version: String(car.version),
        }}
        label="Offer to drive"
        creates
        onResult={(result) => {
          if (result.path) onClose();
        }}
      >
        <UI.Label>
          Car
          <UI.Select
            name="vehicle_id"
            value={car.id}
            onChange={(event) => {
              const selected = cars.find(
                (option) => option.id === event.target.value,
              );
              if (selected) setCar(selected);
            }}
            required
          >
            {cars.map((option) => (
              <UI.Option key={option.id} value={option.id}>
                {option.label} · {option.passenger_seats} passenger seats
              </UI.Option>
            ))}
          </UI.Select>
        </UI.Label>
        <UI.Label>
          Passenger seats you can offer
          <UI.Field
            key={car.id}
            name="available_seats"
            type="number"
            min={1}
            max={car.passenger_seats}
            step={1}
            defaultValue={car.passenger_seats}
            required
          />
        </UI.Label>
        <UI.Label className="checkbox-label">
          <UI.Field type="checkbox" name="restraints" value="yes" required />
          I can accommodate the required restraints for every rider.
        </UI.Label>
      </CommandForm>
      <UI.Button onPress={onClose}>Close offer form</UI.Button>
    </UI.Box>
  );
}
