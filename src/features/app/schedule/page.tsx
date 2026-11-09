import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import Link from "@/ui/link";
import { PageHeading, EmptyState, ActionDialog } from "../presentation";
import { createClient } from "@/lib/supabase/client";
import { addDays, dateInZone, validTimezone, weekRange } from "@/lib/rides";
import { RideList } from "../ride-list";
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

const Schedule = createScreen(
  loadSchedule,
  ({ range, zone, offers, statuses, weekLink, unique }) => (
    <>
      <PageHeading
        title="Schedule"
        action={
          <Link className="button primary" href="/app/rides/new">
            ＋ Plan a ride
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
      <UI.Nav className="week-navigation" aria-label="Schedule weeks">
        <Link href={weekLink(addDays(range.monday, -7))}>← Previous week</Link>
        <ActionDialog title="Choose week or timezone">
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
        <Link href={weekLink(range.next)}>Next week →</Link>
      </UI.Nav>
      <UI.Box className="week-strip" role="group" aria-label="Full week">
        {Array.from({ length: 7 }, (_, index) => {
          const date = addDays(range.monday, index);
          const count = unique.filter(
            (ride) => dateInZone(new Date(ride.starts_at), zone) === date,
          ).length;
          return (
            <UI.Box
              className={`week-day${date === dateInZone(new Date(), zone) ? " today" : ""}`}
              key={date}
            >
              <UI.Inline>
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]}
              </UI.Inline>
              <UI.Strong>{Number(date.slice(-2))}</UI.Strong>
              <UI.Small>
                {count ? `${count} ${count === 1 ? "ride" : "rides"}` : "—"}
              </UI.Small>
            </UI.Box>
          );
        })}
      </UI.Box>
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
