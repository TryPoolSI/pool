import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import Link from "@/ui/link";
import { CommandForm } from "@/ui/command-form";
import { colors } from "@/ui/styles";
import { createClient } from "@/lib/supabase/client";
import { driverAction } from "@/services/driver-actions";
import { PageHeading, ActionDialog, Disclosure, Icon } from "../presentation";
import { AddVehicleForm } from "../driver-form";
import { CarRow, seatCount, type Car } from "../families/family-vehicle-setup";

async function loadVehicles() {
  const client = await createClient();
  const [vehicles, profiles] = await Promise.all([
    client.from("vehicles").select("*").order("created_at"),
    client.auth.getUser(),
  ]);
  if (vehicles.error || profiles.error)
    throw new Error("Pool couldn’t load your cars.");
  const profile = await client
    .from("profiles")
    .select("id")
    .eq("id", profiles.data.user!.id)
    .maybeSingle();
  if (profile.error) throw new Error("Pool couldn’t load your cars.");
  return { model: { vehicles, profile } };
}

// A removed car comes back with the name and seats it had.
function RestoreCar({ car }: { car: Car }) {
  return (
    <UI.Box className="child-row" role="group" aria-label={car.label}>
      <UI.Box style={{ flex: 1 }}>
        <UI.Strong>{car.label}</UI.Strong>
        <UI.Small style={{ color: colors.muted }}>
          {seatCount(car.passenger_seats)}
        </UI.Small>
      </UI.Box>
      <CommandForm
        action={async (values) => {
          const result = await driverAction({}, values);
          return result.error
            ? result
            : { message: `${car.label} restored` };
        }}
        fields={{
          command: "saveVehicle",
          vehicle_id: car.id,
          version: String(car.version),
          label: car.label,
          passenger_seats: String(car.passenger_seats),
        }}
        label="Restore car"
        secondary
        after="toast"
      />
    </UI.Box>
  );
}

const Vehicles = createScreen(loadVehicles, ({ vehicles, profile }) => {
  const active = vehicles.data.filter((car) => !car.retired_at);
  const removed = vehicles.data.filter((car) => car.retired_at);
  return (
    <>
      <PageHeading
        title="Your cars"
        action={
          profile.data && active.length > 0 ? (
            <ActionDialog title="Add a car">
              <AddVehicleForm />
            </ActionDialog>
          ) : undefined
        }
      >
        The cars you drive for rides.
      </PageHeading>
      {!profile.data ? (
        <UI.Section>
          <UI.Paragraph style={{ marginTop: 0 }}>
            Set up your family first, then add the car you drive.
          </UI.Paragraph>
          <Link className="button primary" href="/app/profile">
            Set up your family
          </Link>
        </UI.Section>
      ) : (
        <>
          {active.length ? (
            <UI.Section>
              {active.map((car) => (
                <CarRow key={car.id} car={car} />
              ))}
            </UI.Section>
          ) : (
            <UI.Section>
              <UI.Box className="empty-state">
                <UI.Box className="empty-symbol">
                  <Icon name="car" size={26} color={colors.ink} />
                </UI.Box>
                <UI.Heading3
                  style={{ marginTop: 0, marginBottom: 0, textAlign: "center" }}
                >
                  No cars yet
                </UI.Heading3>
                <UI.Paragraph
                  style={{ marginVertical: 0, textAlign: "center" }}
                >
                  Add the car you usually drive so you can offer to drive.
                </UI.Paragraph>
                <ActionDialog
                  title="Add a car"
                  tone="primary"
                  triggerStyle={{ alignSelf: "center" }}
                >
                  <AddVehicleForm />
                </ActionDialog>
              </UI.Box>
            </UI.Section>
          )}
          {removed.length > 0 && (
            <Disclosure title="Removed cars">
              {removed.map((car) => (
                <RestoreCar key={car.id} car={car} />
              ))}
            </Disclosure>
          )}
        </>
      )}
    </>
  );
});
export default Vehicles;
