import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import Link from "@/ui/link";
import {
  Avatar,
  EmptyState,
  Icon,
  PageHeading,
  RouteSummary,
  StatusBadge,
} from "../presentation";
import { createClient } from "@/lib/supabase/client";
import { rideTime } from "@/lib/rides";
import { RideList } from "../ride-list";
async function loadAttention({
  searchParams,
}: {
  searchParams: Promise<{ after_trip?: string }>;
}) {
  const query = await searchParams;
  const after = query.after_trip;
  if (after && !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(after))
    throw new Error("Invalid trip cursor");
  const client = await createClient();
  const now = new Date().getTime();
  const [offers, inbox, trips] = await Promise.all([
    client.rpc("ride_offers", {
      p_from: new Date(now).toISOString(),
      p_until: new Date(now + 366 * 86400_000).toISOString(),
    }),
    client.rpc("driver_inbox", { p_pending_only: true, p_limit: 26 }),
    client.rpc("trip_attention", { p_after_id: after, p_limit: 26 }),
  ]);
  if (offers.error || inbox.error || trips.error)
    throw new Error("Attention items could not be loaded");
  const ids = [...new Set(offers.data.map((ride) => ride.id))];
  const [statuses, tripRecords] = await Promise.all([
    client.rpc("driver_statuses", { p_ride_ids: ids }),
    ids.length
      ? client.from("ride_trips").select("ride_id").in("ride_id", ids)
      : { data: [], error: null },
  ]);
  if (statuses.error || tripRecords.error)
    throw new Error("Assignment or trip statuses could not be loaded");
  const active = offers.data.filter((offer) => !offer.cancelled_at);
  const pending = active.filter((offer) => offer.status === "invited");
  const joined = active.filter(
    (offer) =>
      offer.status === "joined" &&
      (statuses.data.find((p) => p.ride_id === offer.id)?.coverage !==
        "confirmed" ||
        statuses.data.find((p) => p.ride_id === offer.id)?.proposal_status ===
          "pending"),
  );
  const driverReplies = inbox.data.slice(0, 25);
  const count = new Set([
    ...trips.data.map((t) => t.ride_id),
    ...pending.map((r) => r.id),
    ...joined.map((r) => r.id),
    ...driverReplies.map((r) => r.ride_id),
  ]).size;
  const featured =
    trips.data.find((t) => t.awaiting_count) ||
    trips.data.find((t) => t.started_at) ||
    trips.data[0];
  const featuredStatus = featured
    ? await client.rpc("driver_status", { p_ride_id: featured.ride_id })
    : null;
  if (featuredStatus?.error)
    throw new Error("Current trip could not be loaded");
  const driver = featuredStatus?.data[0];
  const currentDriver =
    driver?.coverage === "confirmed"
      ? driver.current_driver_name || driver.driver_name
      : null;
  const upcoming = [
    ...new Map(
      active
        .filter(
          (r) =>
            !tripRecords.data.some((t) => t.ride_id === r.id) &&
            statuses.data.some(
              (s) =>
                s.ride_id === r.id &&
                s.coverage === "confirmed" &&
                s.proposal_status !== "pending",
            ),
        )
        .map((r) => [r.id, r]),
    ).values(),
  ].slice(0, 4);
  return {
    model: {
      after,
      offers,
      inbox,
      trips,
      statuses,
      pending,
      joined,
      driverReplies,
      count,
      featured,
      driver,
      currentDriver,
      upcoming,
    },
  };
}

const Attention = createScreen(
  loadAttention,
  ({
    after,
    offers,
    inbox,
    trips,
    statuses,
    pending,
    joined,
    driverReplies,
    count,
    featured,
    driver,
    currentDriver,
    upcoming,
  }) => (
    <>
      <PageHeading
        eyebrow="YOUR FAMILY, IN THE LOOP"
        title={
          featured?.awaiting_count
            ? "A handoff needs your attention."
            : featured?.started_at
              ? "Your family is on the way."
              : "A little planning goes a long way."
        }
        action={
          <Link className="button secondary" href="/app/rides/new">
            ＋ Plan a ride
          </Link>
        }
      >
        {featured?.awaiting_count
          ? "Arrival is reported. Confirm only when your own child is with you."
          : "Your rides, your circle and the next step — together."}
      </PageHeading>
      {featured && (
        <UI.Box className="ride-overview trip-feature">
          <UI.Section className="panel">
            <UI.Box className="section-head">
              <UI.Paragraph className="eyebrow">CURRENT RIDE</UI.Paragraph>
              <StatusBadge
                tone={featured.awaiting_count ? "attention" : "positive"}
              >
                {featured.awaiting_count
                  ? "Handoff needed"
                  : featured.started_at
                    ? "Trip in progress"
                    : "Awaiting pickup"}
              </StatusBadge>
            </UI.Box>
            <UI.Heading2>To {featured.destination_summary}</UI.Heading2>
            <RouteSummary
              pickup={featured.pickup_summary}
              destination={featured.destination_summary}
            />
            <UI.Paragraph className="feature-state">
              {featured.awaiting_count
                ? "Handoff needed"
                : featured.started_at
                  ? "On the way"
                  : "Before pickup"}
            </UI.Paragraph>
            {currentDriver && (
              <UI.Box className="person-meta">
                <Avatar name={currentDriver} tone="rose" />
                <UI.Box>
                  <UI.Strong>{currentDriver}</UI.Strong>
                  <UI.Paragraph>
                    Current driver
                    {driver?.current_proposal_id === driver?.proposal_id &&
                      ` · ${driver?.vehicle_label}`}
                  </UI.Paragraph>
                </UI.Box>
              </UI.Box>
            )}
            <Link
              className="button primary"
              href={`/app/rides/${featured.ride_id}#trip-progress`}
            >
              Review {featured.awaiting_count ? "handoffs" : "ride"}{" "}
              <UI.Inline aria-hidden="true">→</UI.Inline>
            </Link>
          </UI.Section>
          <UI.Box className="feature-details">
            <Icon name="shield" size={28} />
            <UI.Heading3>
              {featured.awaiting_count
                ? `${featured.awaiting_count} awaiting guardian receipt`
                : "Every child has their own handoff"}
            </UI.Heading3>
            <UI.Paragraph>
              {featured.awaiting_count
                ? "The ride remains in progress. Each designated guardian confirms receipt for their own child."
                : "Pickup, arrival and receipt are separate saved reports. A scheduled time never completes a ride."}
            </UI.Paragraph>
            {driver && (
              <UI.Paragraph>
                Pickup: {rideTime(driver.starts_at, driver.timezone)}
                <UI.Break />
                Drop-off: {rideTime(driver.ends_at, driver.timezone)}
              </UI.Paragraph>
            )}
            <UI.Paragraph className="section-caption">
              Manually reported · Reload for updates
            </UI.Paragraph>
          </UI.Box>
        </UI.Box>
      )}
      <UI.Section className="attention-tasks">
        <UI.Box className="section-head">
          <UI.Heading2 aria-label="Needs attention">
            Needs attention{" "}
            <UI.Inline className="number" aria-hidden="true">
              {count}
            </UI.Inline>
          </UI.Heading2>
          <UI.Inline className="section-caption">One clear next step</UI.Inline>
        </UI.Box>
        {!!trips.data.length && (
          <>
            <UI.Heading3>Pickup and handoffs</UI.Heading3>
            <UI.List className="task-list">
              {trips.data.slice(0, 25).map((t) => (
                <UI.ListItem key={t.ride_id}>
                  <UI.Inline className="task-icon">
                    <Icon name="home" />
                  </UI.Inline>
                  <UI.Box>
                    <Link href={`/app/rides/${t.ride_id}`}>
                      {t.pickup_summary} → {t.destination_summary}
                    </Link>
                    <UI.Paragraph>
                      {t.awaiting_count
                        ? `${t.awaiting_count} awaiting guardian receipt`
                        : t.started_at
                          ? "Trip in progress"
                          : "Awaiting pickup"}
                      {!!t.missing_recipient_count &&
                        ` · ${t.missing_recipient_count} receiving guardians needed`}
                      {t.is_driver && " · You are the driver"}
                    </UI.Paragraph>
                  </UI.Box>
                  <Link
                    className="button secondary"
                    href={`/app/rides/${t.ride_id}#trip-progress`}
                  >
                    Review
                  </Link>
                </UI.ListItem>
              ))}
            </UI.List>
          </>
        )}
        {trips.data.length > 25 && (
          <Link href={`/app/attention?after_trip=${trips.data[24].ride_id}`}>
            Next pickup and handoff items
          </Link>
        )}
        {after && (
          <Link href="/app/attention">First pickup and handoff items</Link>
        )}
        {!!pending.length && (
          <>
            <UI.Heading3>Ride invitations</UI.Heading3>
            <RideList offers={pending} statuses={statuses.data} />
          </>
        )}
        {!!joined.length && (
          <>
            <UI.Heading3>Driver and family replies</UI.Heading3>
            <RideList offers={joined} statuses={statuses.data} />
          </>
        )}
        {!!driverReplies.length && (
          <>
            <UI.Heading3>Your driver replies</UI.Heading3>
            <UI.List className="task-list">
              {driverReplies.map((p) => (
                <UI.ListItem key={p.proposal_id}>
                  <UI.Inline className="task-icon">
                    <Icon name="car" />
                  </UI.Inline>
                  <UI.Box>
                    <Link href={`/app/rides/${p.ride_id}`}>
                      {p.pickup_summary} → {p.destination_summary}
                    </Link>
                    <UI.Paragraph>
                      {p.vehicle_label} · {p.rider_count} riders ·{" "}
                      {p.accepted_at
                        ? "You accepted · Request pending"
                        : "Your acceptance is needed"}
                    </UI.Paragraph>
                  </UI.Box>
                  <Link
                    className="button secondary"
                    href={`/app/rides/${p.ride_id}`}
                  >
                    Review
                  </Link>
                </UI.ListItem>
              ))}
            </UI.List>
          </>
        )}
        {inbox.data.length > 25 && (
          <Link href="/app/driving?pending=1">
            See all pending driver requests
          </Link>
        )}
        {!count && (
          <EmptyState title="No items in this view">
            Open your schedule to review other weeks.
          </EmptyState>
        )}
      </UI.Section>
      {!!upcoming.length && (
        <>
          <UI.Box className="section-head">
            <UI.Box>
              <UI.Paragraph className="eyebrow">
                A LITTLE PLANNING GOES A LONG WAY
              </UI.Paragraph>
              <UI.Heading2>Coming up</UI.Heading2>
            </UI.Box>
            <Link className="text-link" href="/app/schedule">
              View the week →
            </Link>
          </UI.Box>
          <RideList offers={upcoming} statuses={statuses.data} />
        </>
      )}
    </>
  ),
);
export default Attention;
