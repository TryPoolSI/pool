import { useWindowDimensions } from "react-native";
import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import Link from "@/ui/link";
import { PageHeading, EmptyState, ActionDialog, Icon } from "../presentation";
import { colors, spacing, styles } from "@/ui/styles";
import { createClient } from "@/lib/supabase/client";
import { addDays, dateInZone, validTimezone, weekRange } from "@/lib/rides";
import { RideList } from "../ride-list";

const dayLabel = new Intl.DateTimeFormat("en", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
async function loadSchedule({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; timezone?: string }>;
}) {
  const query = await searchParams;
  let range: ReturnType<typeof weekRange>, zone: string;
  try {
    zone = validTimezone(query.timezone || "UTC");
    range = weekRange(query.date || dateInZone(new Date(), zone), zone);
  } catch {
    return {
      early: (
        <>
          <UI.Heading1>Weekly schedule</UI.Heading1>
          <UI.Paragraph role="alert">
            Choose a valid date and IANA timezone.
          </UI.Paragraph>
          <Link href="/app/schedule">Open current week in UTC</Link>
        </>
      ),
    };
  }
  const client = await createClient();
  const offers = await client.rpc("ride_offers", {
    p_from: range.from,
    p_until: range.until,
  });
  if (offers.error) throw new Error("Schedule could not be loaded");
  const statuses = await client.rpc("driver_statuses", {
    p_ride_ids: [...new Set(offers.data.map((ride) => ride.id))],
  });
  if (statuses.error)
    throw new Error("Assignment statuses could not be loaded");
  const weekLink = (date: string) =>
    `/app/schedule?date=${date}&timezone=${encodeURIComponent(zone)}`;
  const unique = [
    ...new Map(offers.data.map((ride) => [ride.id, ride])).values(),
  ];
  return { model: { range, zone, offers, statuses, weekLink, unique } };
}

function ScheduleDays({
  monday,
  zone,
  rides,
}: {
  monday: string;
  zone: string;
  rides: { starts_at: string }[];
}) {
  const { width } = useWindowDimensions();
  const today = dateInZone(new Date(), zone);
  const counts = new Map<string, number>();
  for (const ride of rides) {
    const date = dateInZone(new Date(ride.starts_at), zone);
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  return (
    <UI.Box>
      <UI.Small>Choose a day to plan a ride</UI.Small>
      <UI.Box className="week-strip" role="group" aria-label="Full week">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, index) => {
          const date = addDays(monday, index);
          const count = counts.get(date) ?? 0;
          const rideCount = `${count} ${count === 1 ? "ride" : "rides"}`;
          const isToday = date === today;
          const label = dayLabel.format(new Date(`${date}T00:00:00Z`));
          return (
            <Link
              key={date}
              href={`/app/rides/new?${new URLSearchParams({ date, timezone: zone })}`}
              aria-label={`Plan a ride for ${label}, ${rideCount}`}
              aria-current={isToday ? "date" : undefined}
              style={[
                { alignSelf: "stretch", backgroundColor: "transparent" },
                width <= 650
                  ? { flexBasis: "22%", flexGrow: 1, maxWidth: "25%" }
                  : { flex: 1 },
              ]}
            >
              <UI.Box className={`week-day${isToday ? " today" : ""}`}>
                <UI.Inline>{day}</UI.Inline>
                <UI.Strong>{Number(date.slice(-2))}</UI.Strong>
                <UI.Small>{count ? rideCount : "—"}</UI.Small>
                <Icon
                  name="plus"
                  size={16}
                  color={isToday ? "white" : colors.green}
                />
              </UI.Box>
            </Link>
          );
        })}
      </UI.Box>
    </UI.Box>
  );
}

const Schedule = createScreen(
  loadSchedule,
  ({ range, zone, offers, statuses, weekLink, unique }) => (
    <>
      <PageHeading
        title="Schedule"
        action={
          <Link className="button primary" href="/app/rides/new">
            <Icon name="plus" size={16} color="white" />
            Plan a ride
          </Link>
        }
      >
        Week of{" "}
        {new Intl.DateTimeFormat("en", {
          month: "long",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${range.monday}T12:00:00Z`))}{" "}
        · {zone}
      </PageHeading>
      <UI.Box
        className="week-navigation"
        role="navigation"
        aria-label="Schedule weeks"
      >
        <UI.Box style={[styles.actionRow, { columnGap: spacing.lg }]}>
          <Link
            className="text-link"
            href={weekLink(addDays(range.monday, -7))}
          >
            <Icon name="arrow-left" size={16} color={colors.green} />
            Previous week
          </Link>
          <Link className="text-link" href={weekLink(range.next)}>
            Next week
            <Icon name="arrow-right" size={16} color={colors.green} />
          </Link>
        </UI.Box>
        <ActionDialog
          title="Choose week or timezone"
          triggerStyle={{ marginVertical: 0, alignSelf: "auto" }}
        >
          <UI.Form className="auth-form week-filter">
            <UI.Fieldset>
              <UI.Label>
                Week containing date
                <UI.Field
                  type="date"
                  name="date"
                  defaultValue={range.monday}
                  required
                />
              </UI.Label>
              <UI.Label>
                Schedule timezone
                <UI.Field
                  name="timezone"
                  defaultValue={zone}
                  required
                  maxLength={100}
                />
              </UI.Label>
              <UI.Button type="submit">Show week</UI.Button>
            </UI.Fieldset>
          </UI.Form>
        </ActionDialog>
      </UI.Box>
      <ScheduleDays monday={range.monday} zone={zone} rides={unique} />
      {offers.data.length ? (
        <RideList offers={offers.data} statuses={statuses.data} />
      ) : (
        <EmptyState title="A little room in the week">
          No rides in this week. Plan a ride or wait for a family invitation.
        </EmptyState>
      )}
    </>
  ),
);
export default Schedule;
