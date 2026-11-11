import { useQuery } from "@tanstack/react-query";
import * as UI from "@/ui/elements";
import Link from "@/ui/link";
import { createClient } from "@/lib/supabase/client";
import { rideTime, type RideOffer } from "@/lib/rides";
import { useSession } from "@/services/session";
import { StatusBadge } from "./presentation";

const pageSize = 1000;
const weekInMilliseconds = 7 * 24 * 60 * 60 * 1000;

type CoverageRide = Pick<
  RideOffer,
  | "id"
  | "circle_id"
  | "pickup_summary"
  | "destination_summary"
  | "starts_at"
  | "timezone"
>;
type UncoveredRide = CoverageRide & { awaitingConfirmation: boolean };

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

  const coverageByRide = new Map<string, string>();
  const rideIds = [...rides.keys()];
  for (let offset = 0; offset < rideIds.length; offset += pageSize) {
    const { data, error } = await client
      .rpc("driver_statuses", {
        p_ride_ids: rideIds.slice(offset, offset + pageSize),
      })
      .select("ride_id,coverage");

    if (error) throw error;
    for (const status of data)
      coverageByRide.set(status.ride_id, status.coverage);
  }

  const ridesByCircle = new Map<string, UncoveredRide[]>();
  for (const ride of rides.values()) {
    const coverage = coverageByRide.get(ride.id);
    if (coverage === "confirmed") continue;
    const uncovered = {
      ...ride,
      awaitingConfirmation: coverage === "awaiting_confirmation",
    };
    const circleRides = ridesByCircle.get(ride.circle_id);
    if (circleRides) circleRides.push(uncovered);
    else ridesByCircle.set(ride.circle_id, [uncovered]);
  }
  return ridesByCircle;
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
    const rides = coverage.data?.get(circle.id);
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
                    {ride.awaitingConfirmation
                      ? "Driver not confirmed"
                      : "Needs a driver"}
                  </StatusBadge>
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
