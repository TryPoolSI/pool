import { newRequestId } from "@/lib/request-id";
import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import Link from "@/ui/link";
import { PageHeading } from "../../presentation";
import { createClient } from "@/lib/supabase/client";
import { RideForm, ChildChoices, LocalTimeField } from "../../ride-form";
async function loadNewRide({
  searchParams,
}: {
  searchParams: Promise<{ family?: string; circle?: string }>;
}) {
  const query = await searchParams;
  const client = await createClient();
  const [families, circles, memberships] = await Promise.all([
    client.from("families").select("id,name").order("name"),
    client.from("circles").select("id,name").order("name"),
    client.from("circle_families").select("family_id,circle_id"),
  ]);
  if (families.error || circles.error || memberships.error)
    throw new Error("Ride context could not be loaded");
  const contexts = families.data.flatMap((family) =>
    circles.data
      .filter((circle) =>
        memberships.data.some(
          (m) => m.family_id === family.id && m.circle_id === circle.id,
        ),
      )
      .map((circle) => ({ family, circle })),
  );
  const context =
    query.family || query.circle
      ? contexts.find(
          (item) =>
            item.family.id === query.family && item.circle.id === query.circle,
        )
      : contexts[0];
  if (!context)
    return {
      early: (
        <>
          <UI.Heading1>Plan a ride</UI.Heading1>
          <UI.Paragraph>
            Join a circle with your family before planning. Choose a valid
            family and circle.
          </UI.Paragraph>
          <Link href="/app">Families and circles</Link>
        </>
      ),
    };
  const { family, circle } = context;
  const [children, roster] = await Promise.all([
    client
      .from("children")
      .select("id,display_name")
      .eq("family_id", family.id)
      .order("display_name"),
    client.rpc("circle_roster", { p_circle_id: circle.id }),
  ]);
  if (children.error || roster.error)
    throw new Error("Riders could not be loaded");
  return { model: { contexts, family, circle, children, roster } };
}

const NewRide = createScreen(
  loadNewRide,
  ({ contexts, family, circle, children, roster }) => (
    <UI.Box className="ride-plan">
      <PageHeading title="Plan a ride">
        {family.name} · {circle.name}
      </PageHeading>
      {contexts.length > 1 && (
        <UI.Nav aria-label="Planning context">
          {contexts.map((item) => (
            <Link
              key={`${item.family.id}-${item.circle.id}`}
              href={`/app/rides/new?family=${item.family.id}&circle=${item.circle.id}`}
            >
              {item.family.name} · {item.circle.name}
            </Link>
          ))}
        </UI.Nav>
      )}
      {!children.data.length ? (
        <UI.Paragraph>
          Add at least one of your own children in{" "}
          <Link href={`/app/children?family=${family.id}`}>child setup</Link>{" "}
          before planning.
        </UI.Paragraph>
      ) : (
        <RideForm
          key={`${family.id}-${circle.id}`}
          command="createRide"
          fields={{
            ride_id: newRequestId(),
            family_id: family.id,
            circle_id: circle.id,
          }}
          label="Create ride"
        >
          <UI.Box className="form-section">
            <UI.Heading2>Route</UI.Heading2>
            <UI.Label>
              Travel direction
              <UI.Select name="direction" required>
                <UI.Option value="outbound">Outbound</UI.Option>
                <UI.Option value="return">Return</UI.Option>
              </UI.Select>
            </UI.Label>
            <UI.Paragraph>
              Use general place names in the summaries. Invited families can see
              them before joining.
            </UI.Paragraph>
            <UI.Box className="form-pair">
              <UI.Label>
                Pickup summary
                <UI.Field
                  name="pickup_summary"
                  required
                  maxLength={80}
                  placeholder="Neighborhood meeting area"
                />
              </UI.Label>
              <UI.Label>
                Drop-off summary
                <UI.Field
                  name="destination_summary"
                  required
                  maxLength={80}
                  placeholder="Activity area"
                />
              </UI.Label>
            </UI.Box>
            <UI.Paragraph>
              Exact locations stay with participating families and the confirmed
              driver.
            </UI.Paragraph>
            <UI.Box className="form-pair">
              <UI.Label>
                Exact pickup
                <UI.Field name="pickup" required maxLength={300} />
              </UI.Label>
              <UI.Label>
                Exact drop-off
                <UI.Field name="destination" required maxLength={300} />
              </UI.Label>
            </UI.Box>
          </UI.Box>
          <UI.Box className="form-section">
            <UI.Heading2>Time</UI.Heading2>
            <UI.Label>
              IANA timezone
              <UI.Field
                name="timezone"
                defaultValue="UTC"
                required
                maxLength={100}
                placeholder="America/Denver"
              />
            </UI.Label>
            <UI.Box className="form-pair">
              <UI.Box>
                <LocalTimeField name="starts" label="Pickup time" />
              </UI.Box>
              <UI.Box>
                <LocalTimeField name="ends" label="Drop-off time" />
              </UI.Box>
            </UI.Box>
            <UI.Paragraph>Times use the selected timezone.</UI.Paragraph>
          </UI.Box>
          <UI.Box className="form-section">
            <UI.Heading2>Riders</UI.Heading2>
            <ChildChoices>{children.data}</ChildChoices>
            <UI.Fieldset>
              <UI.Legend>Invite other circle families</UI.Legend>
              {roster.data
                .filter((item) => item.family_id !== family.id)
                .map((item) => (
                  <UI.Label className="checkbox-label" key={item.family_id}>
                    <UI.Field
                      type="checkbox"
                      name="invited_family_ids"
                      value={item.family_id}
                    />
                    {item.family_name}
                  </UI.Label>
                ))}
              <UI.Paragraph>
                Each family chooses its own riders and approves the driver
                separately.
              </UI.Paragraph>
            </UI.Fieldset>
          </UI.Box>
        </RideForm>
      )}
    </UI.Box>
  ),
);
export default NewRide;
