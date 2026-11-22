import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import * as UI from "@/ui/elements";
import Link from "@/ui/link";
import type { DriverStatus } from "@/lib/drivers";
import { createClient } from "@/lib/supabase/client";
import { rideTimeShort, type RideOffer } from "@/lib/rides";
import { rideSummary } from "@/lib/ride-state";
import { useSession } from "@/services/session";
import { colors, spacing, styles } from "@/ui/styles";
import { EmptyState, Icon } from "./presentation";
import { RideCard } from "./ride-list";
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
  | "ends_at"
  | "timezone"
  | "direction"
>;
const statusColumns =
  "ride_id,coverage,accepted_at,proposal_status,mode,driver_name,current_driver_name,current_assignment_release_reason,is_driver,is_current_driver";
type CoverageStatus = Pick<
  DriverStatus,
  | "ride_id"
  | "coverage"
  | "accepted_at"
  | "proposal_status"
  | "mode"
  | "driver_name"
  | "current_driver_name"
  | "current_assignment_release_reason"
  | "is_driver"
  | "is_current_driver"
>;
type UncoveredRide = CoverageRide & {
  status?: CoverageStatus;
  offer?: OfferDetails;
  // Known only for a ride anyone could take that this adult got no offer for.
  riderCount?: number;
};

// Rides where this account has a move: an invitation to answer, a request to
// drive or a child to receive. Today owns the full list; Home
// only counts them. A failure here must not hide the rest, so it degrades to
// "unknown" (null).
async function loadWaiting(
  client: ReturnType<typeof createClient>,
  from: string,
  until: string,
) {
  const [inbox, receipts, invited] = await Promise.all([
    client.rpc("driver_inbox", { p_pending_only: true, p_limit: 26 }),
    client.rpc("pending_handoff_receipts").limit(26),
    client
      .rpc("ride_offers", { p_from: from, p_until: until })
      .select("id")
      .eq("status", "invited")
      .is("cancelled_at", null)
      .limit(26),
  ]);
  if (inbox.error || receipts.error || invited.error)
    return null;
  return new Set([
    ...inbox.data.map((item) => item.ride_id),
    ...receipts.data.map((item) => item.ride_id),
    ...invited.data.map((item) => item.id),
  ]).size;
}

async function loadDriverCoverage() {
  const client = createClient();
  const now = Date.now();
  const from = new Date(now).toISOString();
  const until = new Date(now + weekInMilliseconds).toISOString();
  const rides = new Map<string, CoverageRide>();
  const waiting = loadWaiting(client, from, until);

  // One ride can have several family offers. Include family_id to order those
  // rows consistently across pages before deduplicating the rides.
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .rpc("ride_offers", { p_from: from, p_until: until })
      .select(
        "id,circle_id,family_id,pickup_summary,destination_summary,starts_at,ends_at,timezone,direction",
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
      client.rpc("driver_statuses", ids).select(statusColumns),
      client.rpc("drive_offer_details", ids),
    ]);
    if (statuses.error) throw statuses.error;
    // Coverage can load before the database exposes offer-to-drive eligibility.
    if (offers.error && offers.error.code !== "PGRST202") throw offers.error;
    for (const status of statuses.data) coverageByRide.set(status.ride_id, status);
    for (const offer of offers.data ?? []) offersByRide.set(offer.ride_id, offer);
  }

  // A ride nobody has been asked to drive. Anyone with a car that fits can
  // take it, whether or not every invited family has answered.
  const open = (id: string) =>
    coverageByRide.get(id)?.coverage !== "confirmed" &&
    coverageByRide.get(id)?.coverage !== "awaiting_confirmation";
  let cars: OfferCar[] = [];
  if (rideIds.some(open)) {
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

  // Pool sends no offer for a ride this adult has no car for. Count its riders
  // so the card can say whether a car is missing or the car is too small.
  const unoffered = rideIds.filter((id) => open(id) && !offersByRide.has(id));
  const riderCounts = new Map<string, number>();
  for (let offset = 0; offset < unoffered.length; offset += pageSize) {
    const { data, error } = await client
      .from("ride_riders")
      .select("ride_id")
      .in("ride_id", unoffered.slice(offset, offset + pageSize));
    if (error) throw error;
    for (const row of data)
      riderCounts.set(row.ride_id, (riderCounts.get(row.ride_id) ?? 0) + 1);
  }

  const ridesByCircle = new Map<string, UncoveredRide[]>();
  const joinedByCircle = new Map<string, number>();
  for (const ride of rides.values()) {
    joinedByCircle.set(ride.circle_id, (joinedByCircle.get(ride.circle_id) ?? 0) + 1);
    const status = coverageByRide.get(ride.id);
    if (status?.coverage === "confirmed") continue;
    const uncovered = {
      ...ride,
      status,
      offer:
        status?.coverage === "awaiting_confirmation"
          ? undefined
          : offersByRide.get(ride.id),
      riderCount: riderCounts.get(ride.id),
    };
    const circleRides = ridesByCircle.get(ride.circle_id);
    if (circleRides) circleRides.push(uncovered);
    else ridesByCircle.set(ride.circle_id, [uncovered]);
  }
  return { ridesByCircle, joinedByCircle, cars, waiting: await waiting };
}

function Banner({
  tone,
  icon,
  title,
  children,
}: {
  tone: "attention" | "positive";
  icon: "warning" | "check";
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <UI.Section
      className={`panel coverage-summary ${tone}`}
      aria-label={title}
    >
      <View style={styles.row}>
        <UI.Box className={tone === "attention" ? "task-icon" : "team-icon"}>
          <Icon
            name={icon}
            color={tone === "attention" ? colors.sunInk : colors.ink}
          />
        </UI.Box>
        <UI.Heading2 style={{ flex: 1, marginBottom: 0, color: colors.ink }}>
          {title}
        </UI.Heading2>
      </View>
      {children}
    </UI.Section>
  );
}

// Home answers two questions in order: what needs me, and which rides still
// have nobody driving. Everything else lives on Today and the Schedule.
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

  if (coverage.isError)
    return (
      <UI.Section className="panel">
        <UI.Paragraph role="alert">
          Pool couldn’t load your rides. Check your connection and try again.
        </UI.Paragraph>
        <UI.Button onPress={() => void coverage.refetch()}>Try again</UI.Button>
      </UI.Section>
    );
  if (coverage.isPending) return <UI.Loading />;

  const { ridesByCircle, joinedByCircle, cars, waiting } = coverage.data;
  const uncovered = circles
    .flatMap((circle) => ridesByCircle.get(circle.id) ?? [])
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const joined = circles.reduce(
    (total, circle) => total + (joinedByCircle.get(circle.id) ?? 0),
    0,
  );
  // The page's single primary action: the soonest ride this account can drive.
  const primaryRide = waiting
    ? undefined
    : uncovered.find(
        (ride) =>
          ride.offer &&
          cars.some((car) => car.passenger_seats >= ride.offer!.rider_count),
      )?.id;

  return (
    <>
      {waiting !== null && waiting > 0 && (
        <Banner
          tone="attention"
          icon="warning"
          title={`${waiting > 25 ? "25+" : waiting} ${waiting === 1 ? "ride needs" : "rides need"} your reply`}
        >
          <Link className="button primary" href="/app/attention">
            See what’s waiting
            <Icon name="arrow-right" size={16} />
          </Link>
        </Banner>
      )}
      <UI.Box
        role="region"
        aria-label="Needs a driver"
        style={{ marginTop: spacing.md }}
      >
        <UI.Box className="section-head">
          <UI.Box>
            <UI.Heading2 style={{ marginBottom: 0 }}>Needs a driver</UI.Heading2>
            <UI.Small className="section-caption">Next 7 days</UI.Small>
          </UI.Box>
          <Link className="text-link" href="/app/schedule">
            Schedule
            <Icon name="arrow-right" size={16} color={colors.blue} />
          </Link>
        </UI.Box>
        {uncovered.length ? (
          <UI.List className="ride-list">
            {uncovered.map((ride) => (
              <RideCard
                key={ride.id}
                ride={ride}
                summary={rideSummary({
                  familyStatus: "joined",
                  status: ride.status,
                })}
              >
                {(ride.offer || ride.riderCount !== undefined) && (
                  <HomeDriverOffer
                    details={ride.offer}
                    riderCount={ride.riderCount}
                    familyId={ride.family_id}
                    cars={cars}
                    rideLabel={`${rideTimeShort(ride.starts_at, ride.timezone)} · ${ride.pickup_summary} → ${ride.destination_summary}`}
                    primary={ride.id === primaryRide}
                  />
                )}
              </RideCard>
            ))}
          </UI.List>
        ) : joined ? (
          <Banner
            tone="positive"
            icon="check"
            title={
              joined === 1
                ? "Your ride this week has a driver"
                : `All ${joined} rides this week have a driver`
            }
          />
        ) : (
          <UI.Section className="panel">
            <EmptyState
              icon="calendar"
              title="No rides this week"
              href="/app/rides/new"
              action="Plan a ride"
            >
              Plan one, or wait for another family to invite yours.
            </EmptyState>
          </UI.Section>
        )}
      </UI.Box>
    </>
  );
}
