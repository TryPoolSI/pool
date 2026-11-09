import { newRequestId } from "@/lib/request-id";
import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import { PageHeading, ActionDialog, Icon } from "../presentation";
import { createClient } from "@/lib/supabase/client";
import { DriverForm, VehicleFields, Confirmation } from "../driver-form";
async function loadVehicles() {
  const client = await createClient();
  const [vehicles, profiles] = await Promise.all([
    client.from("vehicles").select("*").order("created_at"),
    client.auth.getUser(),
  ]);
  if (vehicles.error || profiles.error)
    throw new Error("Vehicles could not be loaded");
  const profile = await client
    .from("profiles")
    .select("id")
    .eq("id", profiles.data.user!.id)
    .maybeSingle();
  if (profile.error) throw new Error("Driver profile could not be loaded");
  return { model: { vehicles, profile } };
}

const Vehicles = createScreen(loadVehicles, ({ vehicles, profile }) => (
  <>
    <PageHeading title="Your vehicles">
      Passenger seats exclude you, the driver.
    </PageHeading>
    {!profile.data ? (
      <UI.Paragraph>
        Create or join a family before setting up a vehicle.
      </UI.Paragraph>
    ) : (
      <>
        <UI.Box className="people-grid">
          {vehicles.data.length ? (
            vehicles.data.map((v) => (
              <UI.Section className="person-card" key={v.id}>
                <UI.Inline className="team-icon">
                  <Icon name="car" />
                </UI.Inline>
                <UI.Heading2>
                  {v.label}
                  {v.retired_at ? " (retired)" : ""}
                </UI.Heading2>
                <UI.Paragraph>{v.passenger_seats} passenger seats</UI.Paragraph>
                <ActionDialog
                  title={v.retired_at ? "Restore vehicle" : "Edit vehicle"}
                >
                  <DriverForm
                    command="saveVehicle"
                    fields={{ vehicle_id: v.id, version: String(v.version) }}
                    label={v.retired_at ? "Restore vehicle" : "Update vehicle"}
                  >
                    <VehicleFields label={v.label} seats={v.passenger_seats} />
                  </DriverForm>
                  {!v.retired_at && (
                    <DriverForm
                      command="saveVehicle"
                      fields={{
                        vehicle_id: v.id,
                        version: String(v.version),
                        label: v.label,
                        passenger_seats: String(v.passenger_seats),
                        retire: "yes",
                      }}
                      label="Retire vehicle"
                    >
                      <Confirmation>
                        I confirm retirement of this vehicle.
                      </Confirmation>
                    </DriverForm>
                  )}
                </ActionDialog>
              </UI.Section>
            ))
          ) : (
            <UI.Paragraph>No registered vehicles yet.</UI.Paragraph>
          )}
        </UI.Box>
        <ActionDialog
          title="Add a vehicle"
          tone="primary"
          inline={!vehicles.data.length}
        >
          <DriverForm
            command="saveVehicle"
            fields={{ vehicle_id: newRequestId(), version: "0" }}
            label="Save vehicle"
          >
            <VehicleFields />
          </DriverForm>
        </ActionDialog>
      </>
    )}
  </>
));
export default Vehicles;
