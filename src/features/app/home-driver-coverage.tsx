import { useQuery } from "@tanstack/react-query";
import * as UI from "@/ui/elements";
import Link from "@/ui/link";
import { coverageLabel, type DriverStatus } from "@/lib/drivers";
import { createClient } from "@/lib/supabase/client";
import { rideTime, type RideOffer } from "@/lib/rides";
import { useSession } from "@/services/session";
import { StatusBadge } from "./presentation";
import {
  HomeDriverOffer,
  type OfferCar,
  type OfferDetails,
} from "./home-driver-offer";

const pageSize = 1000;
const weekInMilliseconds = 7 * 24 * 60 * 60 * 1000;

type CoverageRide = Pick<
  RideOffer,
  | "id"
  | "family_id"
  | "circle_id"
  | "pickup_summary"
  | "destination_summary"
  | "starts_at"
  | "timezone"
>;
type CoverageStatus = Pick<DriverStatus, "ride_id" | "coverage" | "accepted_at">;
type UncoveredRide = CoverageRide & {
  status?: CoverageStatus;
  offer?: OfferDetails;
};

async function loadDriverCoverage() {
  const client = createClient();
  const now = Date.now();
  const from = new Date(now).toISOString();
  const until = new Date(now + weekInMilliseconds).toISOString();
  const rides = new Map<string, CoverageRide>();

  // One ride can have several family offers. Include family_id to order those
  // rows consistently across pages before deduplicating the rides.
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .rpc("ride_offers", { p_from: from, p_until: until })
      .select(
        "id,circle_id,family_id,pickup_summary,destination_summary,starts_at,timezone",
      )
      .eq("status", "joined")
      .is("cancelled_at", null)
      .gte("starts_at", from)
      .order("starts_at")
      .order("id")
      .order("family_id")
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    for (const ride of data) rides.set(ride.id, ride);
    if (data.length < pageSize) break;
  }

  const coverageByRide = new Map<string, CoverageStatus>();
  const offersByRide = new Map<string, OfferDetails>();
  const rideIds = [...rides.keys()];
  for (let offset = 0; offset < rideIds.length; offset += pageSize) {
    const ids = { p_ride_ids: rideIds.slice(offset, offset + pageSize) };
    const [statuses, offers] = await Promise.all([
      client.rpc("driver_statuses", ids).select("ride_id,coverage,accepted_at"),
      client.rpc("drive_offer_details", ids),
    ]);
    if (statuses.error) throw statuses.error;
    if (offers.error) throw offers.error;
    for (const status of statuses.data) coverageByRide.set(status.ride_id, status);
    for (const offer of offers.data) offersByRide.set(offer.ride_id, offer);
  }

  let cars: OfferCar[] = [];
  if (offersByRide.size) {
    const { data, error } = await client
      .from("vehicles")
      .select("id,label,version,passenger_seats")
      .is("retired_at", null)
      .order("passenger_seats", { ascending: false })
      .order("label")
      .order("id");
    if (error) throw error;
    cars = data;
  }

  const ridesByCircle = new Map<string, UncoveredRide[]>();
  for (const ride of rides.values()) {
    const status = coverageByRide.get(ride.id);
    if (status?.coverage === "confirmed") continue;
    const uncovered = {
      ...ride,
      status,
      offer:
        status?.coverage === "awaiting_confirmation"
          ? undefined
          : offersByRide.get(ride.id),
    };
    const circleRides = ridesByCircle.get(ride.circle_id);
    if (circleRides) circleRides.push(uncovered);
    else ridesByCircle.set(ride.circle_id, [uncovered]);
  }
  return { ridesByCircle, cars };
}

export function HomeDriverCoverage({
  circles,
}: {
  circles: { id: string; name: string }[];
}) {
  const { user } = useSession();
  const coverage = useQuery({
    queryKey: ["account", user?.id, "home-driver-coverage"],
    queryFn: loadDriverCoverage,
    enabled: Boolean(user) && circles.length > 0,
  });
  const groups = circles.flatMap((circle) => {
    const rides = coverage.data?.ridesByCircle.get(circle.id);
    return rides ? [{ ...circle, rides }] : [];
  });

  return (
    <UI.Section role="region" aria-label="Driver coverage">
      <UI.Heading2>Driver coverage</UI.Heading2>
      <UI.Paragraph>Joined rides in the next 7 days.</UI.Paragraph>
      {coverage.isError ? (
        <>
          <UI.Paragraph role="alert">
            Driver coverage could not be loaded.
          </UI.Paragraph>
          <UI.Button onPress={() => void coverage.refetch()}>
            Retry driver coverage
          </UI.Button>
        </>
      ) : coverage.isPending ? (
        <UI.Paragraph role="status">Loading driver coverage…</UI.Paragraph>
      ) : groups.length ? (
        groups.map((circle) => (
          <UI.Box key={circle.id} role="group" aria-label={circle.name}>
            <UI.Heading3>{circle.name}</UI.Heading3>
            <UI.List>
              {circle.rides.map((ride) => (
                <UI.ListItem key={ride.id}>
                  <Link href={`/app/rides/${ride.id}`}>
                    {`${ride.pickup_summary} → ${ride.destination_summary}`}
                  </Link>
                  <UI.Paragraph>
                    Pickup: {rideTime(ride.starts_at, ride.timezone)}
                  </UI.Paragraph>
                  <StatusBadge tone="attention">
                    {ride.status?.coverage === "awaiting_confirmation"
                      ? ride.status.accepted_at
                        ? coverageLabel(ride.status.coverage, ride.status.accepted_at)
                        : "Driver not confirmed"
                      : "Needs a driver"}
                  </StatusBadge>
                  <HomeDriverOffer
                    details={ride.offer}
                    familyId={ride.family_id}
                    cars={coverage.data?.cars ?? []}
                  />
                </UI.ListItem>
              ))}
            </UI.List>
          </UI.Box>
        ))
      ) : (
        <UI.Paragraph>
          No joined rides need a driver in the next 7 days.
        </UI.Paragraph>
      )}
      <Link href="/app/schedule">Open Schedule</Link>
    </UI.Section>
  );
}
