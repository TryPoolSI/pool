import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import * as UI from "@/ui/elements";
import Link from "@/ui/link";
import { coverageLabel, type DriverStatus } from "@/lib/drivers";
import { createClient } from "@/lib/supabase/client";
import { rideTimeShort, type RideOffer } from "@/lib/rides";
import { useSession } from "@/services/session";
import { colors, spacing } from "@/ui/styles";
import { Icon, StatusBadge } from "./presentation";
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

// Rides with a pending driver reply, consent or guardian receipt for this
// account. Attention owns the full list; Home only counts them. A failure here
// must not hide coverage, so it degrades to "unknown" (null).
async function loadWaiting(client: ReturnType<typeof createClient>) {
  const [inbox, consents, receipts] = await Promise.all([
    client.rpc("driver_inbox", { p_pending_only: true, p_limit: 26 }),
    client.rpc("pending_family_consents").limit(26),
    client.rpc("pending_handoff_receipts").limit(26),
  ]);
  if (inbox.error || consents.error || receipts.error) return null;
  return new Set([
    ...inbox.data.map((item) => item.ride_id),
    ...consents.data.map((item) => item.ride_id),
    ...receipts.data.map((item) => item.ride_id),
  ]).size;
}

async function loadDriverCoverage() {
  const client = createClient();
  const now = Date.now();
  const from = new Date(now).toISOString();
  const until = new Date(now + weekInMilliseconds).toISOString();
  const rides = new Map<string, CoverageRide>();
  const waiting = loadWaiting(client);

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
    // Coverage can load before the database exposes offer-to-drive eligibility.
    if (offers.error && offers.error.code !== "PGRST202") throw offers.error;
    for (const status of statuses.data) coverageByRide.set(status.ride_id, status);
    for (const offer of offers.data ?? []) offersByRide.set(offer.ride_id, offer);
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
    };
    const circleRides = ridesByCircle.get(ride.circle_id);
    if (circleRides) circleRides.push(uncovered);
    else ridesByCircle.set(ride.circle_id, [uncovered]);
  }
  return { ridesByCircle, joinedByCircle, cars, waiting: await waiting };
}

function coverageText(status?: CoverageStatus) {
  if (status?.coverage !== "awaiting_confirmation") return "Needs a driver";
  return status.accepted_at
    ? coverageLabel(status.coverage, status.accepted_at)
    : "Driver not confirmed";
}

function rideDate(ride: CoverageRide) {
  const at = new Date(ride.starts_at);
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en", { ...options, timeZone: ride.timezone }).format(at);
  return { weekday: part({ weekday: "short" }), day: part({ day: "numeric" }) };
}

function restraintText(offer: OfferDetails) {
  const riders = offer.rider_count === 1 ? "1 rider" : `${offer.rider_count} riders`;
  const needs = [
    offer.booster_count &&
      `${offer.booster_count} booster${offer.booster_count === 1 ? "" : "s"}`,
    offer.child_seat_count &&
      `${offer.child_seat_count} child seat${offer.child_seat_count === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return needs.length ? `${riders} · ${needs.join(", ")}` : riders;
}

function CoverageSummary({
  uncovered,
  waiting,
}: {
  uncovered: UncoveredRide[];
  waiting: number | null;
}) {
  const next = uncovered[0];
  const attention = uncovered.length > 0;
  return (
    <UI.Section
      className={`panel coverage-summary ${attention ? "attention" : "positive"}`}
      aria-label="Coverage summary"
    >
      <UI.Box className="coverage-summary-main">
        <UI.Box className={attention ? "task-icon" : "team-icon"}>
          <Icon
            name={attention ? "warning" : "check"}
            color={attention ? colors.amber : colors.green}
          />
        </UI.Box>
        <UI.Box style={{ flex: 1 }}>
          <UI.Heading2 style={{ marginBottom: 2 }}>
            {attention
              ? `${uncovered.length} ${uncovered.length === 1 ? "ride needs" : "rides need"} a driver in the next 7 days`
              : "Every joined ride in the next 7 days has a driver"}
          </UI.Heading2>
          <UI.Small>
            {next
              ? `Next: ${rideTimeShort(next.starts_at, next.timezone)} · ${next.pickup_summary} → ${next.destination_summary}`
              : "Nothing needs a driver right now."}
          </UI.Small>
        </UI.Box>
      </UI.Box>
      <UI.Box className="coverage-summary-foot">
        <UI.Inline>
          {waiting === null
            ? "Check Today’s rides for replies, consents and receipts."
            : waiting === 0
              ? "Nothing is waiting on you."
              : `${waiting > 25 ? "25+" : waiting} ${waiting === 1 ? "ride is" : "rides are"} waiting on your reply, consent or receipt.`}
        </UI.Inline>
        <Link className="text-link" href="/app/attention">
          Open Today’s rides
          <Icon name="arrow-right" size={16} color={colors.green} />
        </Link>
      </UI.Box>
    </UI.Section>
  );
}

function RideCard({
  ride,
  cars,
  primary,
}: {
  ride: UncoveredRide;
  cars: OfferCar[];
  primary: boolean;
}) {
  const { weekday, day } = rideDate(ride);
  const route = `${ride.pickup_summary} → ${ride.destination_summary}`;
  const when = rideTimeShort(ride.starts_at, ride.timezone);
  return (
    <UI.ListItem>
      <UI.Box className="ride-card-top">
        <UI.Box className="ride-card-heading">
          <UI.Box className="ride-date" aria-hidden="true">
            <UI.Inline>{weekday}</UI.Inline>
            <UI.Strong>{day}</UI.Strong>
          </UI.Box>
          <UI.Box className="ride-card-times">
            <Link className="ride-card-title" href={`/app/rides/${ride.id}`}>
              {route}
            </Link>
            <UI.Small>{`Pickup: ${when}`}</UI.Small>
            {ride.offer && <UI.Small>{restraintText(ride.offer)}</UI.Small>}
          </UI.Box>
        </UI.Box>
        <StatusBadge tone="attention">{coverageText(ride.status)}</StatusBadge>
      </UI.Box>
      {ride.offer && (
        <UI.Box className="ride-card-bottom">
          <HomeDriverOffer
            details={ride.offer}
            familyId={ride.family_id}
            cars={cars}
            rideLabel={`${when} · ${route}`}
            primary={primary}
          />
        </UI.Box>
      )}
    </UI.ListItem>
  );
}

function CoverageRegion({ children }: { children: ReactNode }) {
  return (
    // A plain region (not a panel): its Ride cards are panels themselves.
    <UI.Box role="region" aria-label="Driver coverage" style={{ marginVertical: spacing.lg }}>
      <UI.Box className="section-head">
        <UI.Box>
          <UI.Heading2 style={{ marginBottom: 0 }}>Driver coverage</UI.Heading2>
          <UI.Small className="section-caption">
            Rides your family joined, next 7 days
          </UI.Small>
        </UI.Box>
        <Link className="text-link" href="/app/schedule">
          Open Schedule
          <Icon name="arrow-right" size={16} color={colors.green} />
        </Link>
      </UI.Box>
      {children}
    </UI.Box>
  );
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

  if (coverage.isError)
    return (
      <CoverageRegion>
        <UI.Paragraph role="alert">
          Driver coverage could not be loaded. Check your connection, then try
          again.
        </UI.Paragraph>
        <UI.Button onPress={() => void coverage.refetch()}>
          Retry driver coverage
        </UI.Button>
      </CoverageRegion>
    );
  if (coverage.isPending)
    return (
      <CoverageRegion>
        <UI.Paragraph role="status">Loading driver coverage…</UI.Paragraph>
      </CoverageRegion>
    );

  const { ridesByCircle, joinedByCircle, cars, waiting } = coverage.data;
  const uncovered = circles
    .flatMap((circle) => ridesByCircle.get(circle.id) ?? [])
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  // The page's single primary action: the soonest ride this account can drive.
  const primaryRide = uncovered.find(
    (ride) =>
      ride.offer && cars.some((car) => car.passenger_seats >= ride.offer!.rider_count),
  )?.id;

  return (
    <>
      <CoverageSummary uncovered={uncovered} waiting={waiting} />
      <CoverageRegion>
        {!uncovered.length && (
          <UI.Paragraph>
            No joined rides need a driver in the next 7 days.
          </UI.Paragraph>
        )}
        {circles.map((circle) => {
          const rides = ridesByCircle.get(circle.id) ?? [];
          const joined = joinedByCircle.get(circle.id) ?? 0;
          return (
            <UI.Box key={circle.id} role="group" aria-label={circle.name}>
              <UI.Heading3>{circle.name}</UI.Heading3>
              {rides.length ? (
                <UI.List className="ride-list">
                  {rides.map((ride) => (
                    <RideCard
                      key={ride.id}
                      ride={ride}
                      cars={cars}
                      primary={ride.id === primaryRide}
                    />
                  ))}
                </UI.List>
              ) : joined ? (
                <StatusBadge tone="positive">
                  {joined === 1
                    ? "Your joined ride has a driver"
                    : `All ${joined} joined rides have a driver`}
                </StatusBadge>
              ) : (
                <UI.Small className="section-caption">
                  No joined rides in the next 7 days.
                </UI.Small>
              )}
            </UI.Box>
          );
        })}
      </CoverageRegion>
    </>
  );
}
