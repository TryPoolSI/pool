import * as UI from "@/ui/elements";
import { createPanel } from "@/ui/remote";
import { createClient } from "@/lib/supabase/client";
import Link from "@/ui/link";
import { Avatar, Icon, RouteSummary, StatusBadge } from "./presentation";
import { rideTime, type RideOffer } from "@/lib/rides";
import type { DriverStatus } from "@/lib/drivers";

async function loadRideList({
  offers,
  statuses = [],
}: {
  offers: RideOffer[];
  statuses?: DriverStatus[];
}) {
  const unique = [
    ...new Map(offers.map((offer) => [offer.id, offer])).values(),
  ];
  const client = await createClient();
  const ids = unique.map((ride) => ride.id);
  const [trips, handoffs] = await Promise.all([
    ids.length
      ? client
          .from("ride_trips")
          .select("ride_id,completed_at")
          .in("ride_id", ids)
      : { data: [], error: null },
    ids.length
      ? client.from("ride_handoffs").select("ride_id,status").in("ride_id", ids)
      : { data: [], error: null },
  ]);
  if (trips.error || handoffs.error)
    throw new Error("Trip progress could not be loaded");
  return { model: { offers, statuses, unique, trips, handoffs } };
}

export const RideList = createPanel(
  "loadRideList",
  loadRideList,
  ({ offers, statuses, unique, trips, handoffs }) => (
    <UI.List className="ride-list">
      {unique.map((ride) => {
        const status = statuses.find((item) => item.ride_id === ride.id);
        const trip = trips.data.find((item) => item.ride_id === ride.id);
        const awaiting = handoffs.data.filter(
          (item) =>
            item.ride_id === ride.id && item.status === "awaiting_handoff",
        ).length;
        const hiddenCoverage = !status && ride.status !== "joined";
        const label = ride.cancelled_at
          ? "Cancelled"
          : trip?.completed_at
            ? "Ride completed"
            : awaiting
              ? "Guardian receipt needed"
              : trip
                ? "Trip in progress"
                : hiddenCoverage
                  ? "Private ride summary"
                  : status?.coverage === "confirmed"
                    ? "Driver confirmed"
                    : status?.coverage === "awaiting_confirmation"
                      ? "Driver not confirmed"
                      : "Needs a driver";
        const tone =
          ride.cancelled_at || hiddenCoverage
            ? "neutral"
            : trip?.completed_at
              ? "positive"
              : awaiting || (!trip && status?.coverage !== "confirmed")
                ? "attention"
                : "positive";
        const day = new Date(ride.starts_at);
        const date = new Intl.DateTimeFormat("en", {
          day: "numeric",
          timeZone: ride.timezone,
        }).format(day);
        const weekday = new Intl.DateTimeFormat("en", {
          weekday: "short",
          timeZone: ride.timezone,
        }).format(day);
        const driver =
          !ride.cancelled_at &&
          (status?.coverage === "confirmed" || trip?.completed_at)
            ? status?.current_driver_name || status?.driver_name
            : null;
        const pending =
          !ride.cancelled_at && status?.proposal_status === "pending";
        return (
          <UI.ListItem key={ride.id}>
            <UI.Box className="ride-card-top">
              <UI.Box className="ride-date" aria-hidden="true">
                <UI.Inline>{weekday}</UI.Inline>
                <UI.Strong>{date}</UI.Strong>
              </UI.Box>
              <UI.Box>
                <Link href={`/app/rides/${ride.id}`}>
                  {ride.pickup_summary} → {ride.destination_summary}
                </Link>
                <UI.Paragraph>
                  {ride.direction === "return" ? "Return" : "Outbound"} ·
                  Pickup: {rideTime(ride.starts_at, ride.timezone)}
                </UI.Paragraph>
                <UI.Paragraph>
                  Drop-off: {rideTime(ride.ends_at, ride.timezone)}
                </UI.Paragraph>
              </UI.Box>
              <StatusBadge tone={tone}>{label}</StatusBadge>
            </UI.Box>
            <RouteSummary
              pickup={ride.pickup_summary}
              destination={ride.destination_summary}
            />
            <UI.Box className="ride-card-note">
              {pending && (
                <>
                  <UI.Paragraph>
                    {status.mode === "initial"
                      ? "Driver proposal"
                      : "Replacement review"}
                    : {status.driver_name} ·{" "}
                    {status.accepted_at
                      ? "Driver accepted"
                      : "Driver reply needed"}{" "}
                    · {status.rider_count - status.consent_count} child consents
                    needed
                    {status.mode !== "initial" &&
                      (status.coverage === "confirmed"
                        ? " · Original driver remains assigned"
                        : " · Uncovered until replacement confirms")}
                  </UI.Paragraph>
                  <UI.Paragraph>
                    Reply by {rideTime(status.deadline, status.timezone)}
                  </UI.Paragraph>
                </>
              )}
              {pending && status.coverage !== "confirmed" && (
                <UI.Paragraph>
                  Uncovered until driver acceptance and every child’s consent.
                </UI.Paragraph>
              )}
              {!!awaiting && (
                <UI.Paragraph>
                  {awaiting} awaiting explicit guardian receipt.
                </UI.Paragraph>
              )}
              {hiddenCoverage && (
                <UI.Paragraph>Join to view driver status.</UI.Paragraph>
              )}
              {offers.some(
                (offer) => offer.id === ride.id && offer.status !== "joined",
              ) && (
                <UI.Paragraph>
                  Your family:{" "}
                  {[
                    ...new Set(
                      offers
                        .filter((offer) => offer.id === ride.id)
                        .map((offer) => offer.status),
                    ),
                  ].join(", ")}
                </UI.Paragraph>
              )}
            </UI.Box>
            <UI.Box className="ride-card-bottom">
              {driver ? (
                <>
                  <Avatar name={driver} />
                  <UI.Inline>
                    {trip?.completed_at ? "Trip driver" : "Driver"}: {driver}
                  </UI.Inline>
                </>
              ) : (
                <>
                  <Icon name="car" />
                  <UI.Inline>
                    {hiddenCoverage
                      ? "Private driver details"
                      : ride.cancelled_at
                        ? "Ride cancelled"
                        : "No confirmed driver"}
                  </UI.Inline>
                </>
              )}
              <Link className="button plain" href={`/app/rides/${ride.id}`}>
                View ride <UI.Inline aria-hidden="true">→</UI.Inline>
              </Link>
            </UI.Box>
          </UI.ListItem>
        );
      })}
    </UI.List>
  ),
);
