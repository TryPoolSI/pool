import { View } from "react-native";
import * as UI from "@/ui/elements";
import { colors, spacing, styles } from "@/ui/styles";
import { createPanel } from "@/ui/remote";
import { createClient } from "@/lib/supabase/client";
import Link from "@/ui/link";
import { Icon, StatusBadge } from "./presentation";
import { rideClockRange, rideWhen, type RideOffer } from "@/lib/rides";
import type { DriverStatus } from "@/lib/drivers";
import { rideSummary, type RideSummary } from "@/lib/ride-state";

async function loadRideList({
  offers,
  statuses = [],
  showDate = true,
}: {
  offers: RideOffer[];
  statuses?: DriverStatus[];
  showDate?: boolean;
}) {
  const unique = [
    ...new Map(offers.map((offer) => [offer.id, offer])).values(),
  ];
  const client = await createClient();
  const ids = unique.map((ride) => ride.id);
  const [session, trips, handoffs] = await Promise.all([
    client.auth.getSession(),
    ids.length
      ? client
          .from("ride_trips")
          .select("ride_id,completed_at")
          .in("ride_id", ids)
      : { data: [], error: null },
    ids.length
      ? client
          .from("ride_handoffs")
          .select("ride_id,status,recipient_id")
          .in("ride_id", ids)
      : { data: [], error: null },
  ]);
  if (trips.error || handoffs.error)
    throw new Error("Pool couldn’t load these rides. Try again.");
  return {
    model: {
      statuses,
      unique,
      trips,
      handoffs,
      showDate,
      me: session.data.session?.user.id,
    },
  };
}

// The one ride card. The whole card opens the ride. It answers, in order:
// when, where, what state it is in, and who has to do something about it.
export function RideCard({
  ride,
  summary,
  showDate = true,
  children,
}: {
  ride: Pick<
    RideOffer,
    | "id"
    | "pickup_summary"
    | "destination_summary"
    | "starts_at"
    | "ends_at"
    | "timezone"
    | "direction"
  >;
  summary: RideSummary;
  showDate?: boolean;
  // An inline action for this person (drive it, reply), under the card.
  children?: React.ReactNode;
}) {
  const route = `${ride.pickup_summary} → ${ride.destination_summary}`;
  const when = showDate
    ? rideWhen(ride.starts_at, ride.ends_at, ride.timezone)
    : rideClockRange(ride.starts_at, ride.ends_at, ride.timezone);
  return (
    <UI.ListItem>
      <Link
        href={`/app/rides/${ride.id}`}
        aria-label={`${route}, ${when}, ${summary.label}. ${summary.detail}`}
        style={{
          flexDirection: "column",
          alignItems: "stretch",
          alignSelf: "stretch",
          gap: spacing.xs,
        }}
      >
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <UI.Small style={{ color: colors.muted, flex: 1 }}>
            {when}
            {ride.direction === "return" ? " · Return" : ""}
          </UI.Small>
          <StatusBadge tone={summary.tone}>{summary.label}</StatusBadge>
        </View>
        <UI.Heading3 style={{ marginTop: 0, marginBottom: 0 }}>
          {route}
        </UI.Heading3>
        <View style={[styles.row, { gap: spacing.sm }]}>
          <UI.Small
            style={{
              flex: 1,
              color: summary.mine ? colors.sunInk : colors.muted,
              fontWeight: summary.mine ? "600" : "400",
            }}
          >
            {summary.detail}
          </UI.Small>
          <Icon name="chevron-right" size={18} color={colors.muted} />
        </View>
      </Link>
      {children && <UI.Box className="ride-card-bottom">{children}</UI.Box>}
    </UI.ListItem>
  );
}

export const RideList = createPanel(
  "loadRideList",
  loadRideList,
  ({ statuses, unique, trips, handoffs, showDate, me }) => (
    <UI.List className="ride-list">
      {unique.map((ride) => {
        const status = statuses.find((item) => item.ride_id === ride.id);
        const trip = trips.data.find((item) => item.ride_id === ride.id);
        const awaiting = handoffs.data.filter(
          (item) =>
            item.ride_id === ride.id && item.status === "awaiting_handoff",
        );
        return (
          <RideCard
            key={ride.id}
            ride={ride}
            showDate={showDate}
            summary={rideSummary({
              familyStatus: ride.status,
              cancelled: Boolean(ride.cancelled_at),
              status,
              started: Boolean(trip),
              completed: Boolean(trip?.completed_at),
              awaitingReceipts: awaiting.length,
              // The same "your move" badge this ride wears on Today.
              myReceipts: awaiting.filter((item) => item.recipient_id === me)
                .length,
            })}
          />
        );
      })}
    </UI.List>
  ),
);
