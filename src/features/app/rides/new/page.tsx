import { useState } from "react";
import { dateInZone, deviceTimezone, localDate } from "@/lib/rides";
import { newRequestId } from "@/lib/request-id";
import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import { CommandForm } from "@/ui/command-form";
import Link from "@/ui/link";
import { EmptyState, PageHeading } from "../../presentation";
import { createClient } from "@/lib/supabase/client";
import { membershipAction } from "@/services/membership-actions";
import {
  AddChildSheet,
  ChildChoices,
  RideForm,
  WhenFields,
} from "../../ride-form";
import { RideRouteFields } from "./ride-route-fields";

type Named = { id: string; name: string };
type Roster = { family_id: string; family_name: string }[];

function startDate(value?: string) {
  if (typeof value === "string") {
    try {
      localDate(value);
      return value;
    } catch {
      // A direct link with a bad date falls back to today.
    }
  }
  return dateInZone(new Date(), deviceTimezone());
}

async function loadNewRide({
  searchParams,
}: {
  searchParams: Promise<{ circle?: string; date?: string }>;
}) {
  const query = await searchParams;
  const client = await createClient();
  const [families, circles, memberships] = await Promise.all([
    client.from("families").select("id,name").order("name"),
    client.from("circles").select("id,name").order("name"),
    client.from("circle_families").select("family_id,circle_id"),
  ]);
  if (families.error || circles.error || memberships.error)
    throw new Error("Pool couldn’t load your circles. Try again.");
  // An adult belongs to one family; it may share rides with several circles.
  const family: Named | undefined = families.data.find((item) =>
    memberships.data.some((m) => m.family_id === item.id),
  ) ?? families.data[0];
  if (!family) return { model: { date: startDate(query.date) } };
  const joined = circles.data.filter((circle) =>
    memberships.data.some(
      (m) => m.family_id === family.id && m.circle_id === circle.id,
    ),
  );
  const [children, ...rosters] = await Promise.all([
    client
      .from("children")
      .select("id,display_name")
      .eq("family_id", family.id)
      .order("display_name"),
    ...joined.map((circle) =>
      client.rpc("circle_roster", { p_circle_id: circle.id }),
    ),
  ]);
  if (children.error || rosters.some((roster) => roster.error))
    throw new Error("Pool couldn’t load who can ride. Try again.");
  return {
    model: {
      date: startDate(query.date),
      family,
      children: children.data,
      circles: joined.map((circle, index) => ({
        ...circle,
        others: (rosters[index].data as Roster).filter(
          (item) => item.family_id !== family.id,
        ),
      })),
      preferred: query.circle,
    },
  };
}

function CreateCircle({ familyId }: { familyId: string }) {
  return (
    <UI.Section className="panel">
      <EmptyState title="Start a circle first" icon="users">
        A circle is the group of families you share rides with: a team, a
        class, a street. Name yours, then invite the others.
      </EmptyState>
      <CommandForm
        action={(values) => membershipAction({}, values)}
        fields={{ command: "create-circle", family_id: familyId }}
        label="Create circle"
        after="toast"
      >
        <UI.Label>
          Circle name
          <UI.Field
            name="name"
            required
            maxLength={80}
            placeholder="Lincoln soccer"
          />
        </UI.Label>
      </CommandForm>
    </UI.Section>
  );
}

function Planner({
  date,
  family,
  riders,
  circles,
  preferred,
}: {
  date: string;
  family: Named;
  riders: { id: string; display_name: string }[];
  circles: (Named & { others: Roster })[];
  preferred?: string;
}) {
  const [rideId] = useState(newRequestId);
  const [circleId, setCircleId] = useState(
    circles.find((circle) => circle.id === preferred)?.id ?? circles[0].id,
  );
  // Shown only after the server says the chosen hour happens twice.
  const [repeatedHour, setRepeatedHour] = useState(false);
  const circle = circles.find((item) => item.id === circleId) ?? circles[0];
  return (
    <RideForm
      command="createRide"
      fields={{
        ride_id: rideId,
        family_id: family.id,
        circle_id: circle.id,
        timezone: deviceTimezone(),
      }}
      label="Create ride"
      onResult={(result) =>
        setRepeatedHour(Boolean(result.error?.includes("occurs twice")))
      }
    >
      {circles.length > 1 && (
        <UI.Label>
          Circle
          <UI.Select
            name="circle_choice"
            value={circle.id}
            onChange={({ target }) => setCircleId(target.value)}
          >
            {circles.map((item) => (
              <UI.Option key={item.id} value={item.id}>
                {item.name}
              </UI.Option>
            ))}
          </UI.Select>
        </UI.Label>
      )}
      <UI.Box className="form-section">
        <UI.Heading2>When</UI.Heading2>
        <WhenFields initialDate={date} repeatedHour={repeatedHour} />
      </UI.Box>
      <RideRouteFields familyId={family.id} />
      <UI.Box className="form-section">
        <UI.Heading2>Who’s riding</UI.Heading2>
        <ChildChoices selectOnly>{riders}</ChildChoices>
        <AddChildSheet familyId={family.id} />
        <UI.Fieldset key={circle.id}>
          <UI.Legend>Invite from {circle.name}</UI.Legend>
          {circle.others.length ? (
            <>
              {circle.others.map((item) => (
                <UI.Label className="checkbox-label" key={item.family_id}>
                  <UI.Field
                    type="checkbox"
                    name="invited_family_ids"
                    value={item.family_id}
                    defaultChecked
                  />
                  {item.family_name}
                </UI.Label>
              ))}
              <UI.Paragraph style={{ marginVertical: 0, fontSize: 14 }}>
                Each family picks which of their children ride.
              </UI.Paragraph>
            </>
          ) : (
            <UI.Paragraph style={{ marginVertical: 0 }}>
              No other families in this circle yet.{" "}
              <Link href={`/app/circles/${circle.id}`}>Invite a family</Link>
            </UI.Paragraph>
          )}
        </UI.Fieldset>
      </UI.Box>
    </RideForm>
  );
}

const NewRide = createScreen(loadNewRide, (model) => (
  <UI.Box className="ride-plan">
    <PageHeading title="Plan a ride">
      {"circles" in model && model.circles?.length === 1
        ? model.circles[0].name
        : undefined}
    </PageHeading>
    {!("family" in model) || !model.family ? (
      <UI.Section className="panel">
        <EmptyState
          title="Set up your family first"
          icon="users"
          href="/app/profile"
          action="Set up family"
        >
          Rides are planned for the children in your family.
        </EmptyState>
      </UI.Section>
    ) : !model.circles.length ? (
      <CreateCircle familyId={model.family.id} />
    ) : (
      <Planner
        date={model.date}
        family={model.family}
        riders={model.children}
        circles={model.circles}
        preferred={model.preferred}
      />
    )}
  </UI.Box>
));
export default NewRide;
