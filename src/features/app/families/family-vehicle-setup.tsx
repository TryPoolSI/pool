import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { driverAction } from "@/services/driver-actions";
import { CommandForm } from "@/ui/command-form";
import * as UI from "@/ui/elements";
import { colors } from "@/ui/styles";
import { AddVehicleForm, DriverForm, VehicleFields } from "../driver-form";
import { ActionDialog, Disclosure, Icon } from "../presentation";

export type Car = Pick<
  Database["public"]["Tables"]["vehicles"]["Row"],
  "id" | "label" | "passenger_seats" | "version" | "retired_at"
>;

export const seatCount = (seats: number) =>
  `${seats} passenger ${seats === 1 ? "seat" : "seats"}`;

// One car: its name, its seats, and a sheet to change or remove it.
export function CarRow({ car }: { car: Car }) {
  const fields = { vehicle_id: car.id, version: String(car.version) };
  return (
    <UI.Box className="child-row" role="group" aria-label={car.label}>
      <UI.Box className="team-icon">
        <Icon name="car" />
      </UI.Box>
      <UI.Box style={{ flex: 1 }}>
        <UI.Heading3 style={{ marginTop: 0, marginBottom: 0 }}>
          {car.label}
        </UI.Heading3>
        <UI.Small style={{ color: colors.muted }}>
          {seatCount(car.passenger_seats)}
        </UI.Small>
      </UI.Box>
      <ActionDialog
        title={`Edit ${car.label}`}
        triggerLabel="Edit"
        tone="quiet"
      >
        <DriverForm command="saveVehicle" fields={fields} label="Save changes">
          <VehicleFields label={car.label} seats={car.passenger_seats} />
        </DriverForm>
        <Disclosure title="Remove this car">
          <UI.Paragraph>
            {car.label} will no longer be offered for rides. You can restore it
            later from Cars.
          </UI.Paragraph>
          <CommandForm
            action={(values) => driverAction({}, values)}
            fields={{
              ...fields,
              command: "saveVehicle",
              label: car.label,
              passenger_seats: String(car.passenger_seats),
              retire: "yes",
              confirm: "yes",
            }}
            label="Remove car"
            tone="danger"
          />
        </Disclosure>
      </ActionDialog>
    </UI.Box>
  );
}

// The Cars card on My family. A guardian sees the cars they drive; the
// family-wide check only decides how the empty card is worded.
export function FamilyVehicleSetup({
  userId,
  familyId,
}: {
  userId: string;
  familyId: string;
}) {
  const cars = useQuery({
    queryKey: ["account", userId, "family-cars", familyId],
    queryFn: async ({ signal }) => {
      const client = createClient();
      const own = await client
        .from("vehicles")
        .select("id,label,passenger_seats,version,retired_at")
        .eq("driver_id", userId)
        .is("retired_at", null)
        .order("created_at")
        .abortSignal(signal);
      if (own.error) throw new Error("Pool couldn’t load your cars.");
      const family = own.data.length
        ? { data: true, error: null }
        : await client
            .rpc("family_has_active_vehicle", { p_family_id: familyId })
            .abortSignal(signal);
      // Before the family-wide check is deployed, only the guardian's own cars count.
      return { own: own.data, familyHasCar: family.error ? false : family.data };
    },
  });
  return (
    <UI.Section>
      <UI.Box className="section-head">
        <UI.Heading2 style={{ marginBottom: 0 }}>Cars</UI.Heading2>
        {cars.data && (
          <ActionDialog title="Add a car">
            <AddVehicleForm />
          </ActionDialog>
        )}
      </UI.Box>
      {cars.isPending && <UI.Loading />}
      {cars.isError && (
        <>
          <UI.Paragraph role="alert">
            {cars.data
              ? "Pool can’t refresh your cars right now, so this list may be out of date."
              : cars.error.message}
          </UI.Paragraph>
          <UI.Button onPress={() => void cars.refetch()}>Try again</UI.Button>
        </>
      )}
      {cars.data?.own.length === 0 && (
        <UI.Paragraph style={{ marginVertical: 0 }}>
          {cars.data.familyHasCar
            ? "Another guardian has added a car. Add yours if you drive too."
            : "Add the car you usually drive so you can offer to drive."}
        </UI.Paragraph>
      )}
      {cars.data?.own.map((car) => <CarRow key={car.id} car={car} />)}
    </UI.Section>
  );
}
