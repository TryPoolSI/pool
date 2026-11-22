import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import Link from "@/ui/link";
import { View } from "react-native";
import { colors, spacing } from "@/ui/styles";
import { createClient } from "@/lib/supabase/client";
import type { DriverStatus } from "@/lib/drivers";
import {
  dateInZone,
  daysRange,
  deviceTimezone,
  rideDay,
  type RideOffer,
} from "@/lib/rides";
import { firstName, rideSummary, type RideSummary } from "@/lib/ride-state";
import { EmptyState, Icon, PageHeading } from "../presentation";
import { RideCard } from "../ride-list";
import {
  HandoffAllForm,
  nameList as names,
  type HandoffCommand,
} from "../handoff-form";
import { DriveReply } from "../driving/page";

type CardRide = Pick<
  RideOffer,
  | "id"
  | "pickup_summary"
  | "destination_summary"
  | "starts_at"
  | "ends_at"
  | "timezone"
  | "direction"
>;
// The one thing this person can do from the card, in one tap.
type Step = { child_id: string; version: number; name: string };
type Action =
  | {
      kind: "step";
      command: HandoffCommand;
      label: string;
      rideId: string;
      revision: string;
      items: Step[];
      extra?: Record<string, string>;
    }
  | { kind: "drive"; status: DriverStatus };
type Card = {
  ride: CardRide;
  summary: RideSummary;
  action?: Action;
  urgent?: boolean;
};

const everyone = (count: number, one: string, all: string) =>
  count === 1 ? one : all;
// The driver's pickup step opens an hour before the pickup time.
const pickupWindow = 60 * 60_000;

async function loadToday({
  searchParams,
}: {
  searchParams: Promise<{ after_trip?: string }>;
}) {
  const query = await searchParams;
  const after = query.after_trip;
  if (after && !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(after))
    throw new Error("That link doesn’t work anymore. Open Today again.");
  const client = await createClient();
  const now = Date.now();
  const zone = deviceTimezone();
  const today = daysRange(dateInZone(new Date(now), zone), 1, zone);
  const [user, offers, inbox, trips, receipts] = await Promise.all([
    client.auth.getUser(),
    client.rpc("ride_offers", {
      p_from: today.from,
      p_until: new Date(Date.parse(today.from) + 366 * 86400_000).toISOString(),
    }),
    client.rpc("driver_inbox", { p_pending_only: true, p_limit: 26 }),
    client.rpc("trip_attention", { p_after_id: after, p_limit: 100 }),
    client.rpc("pending_handoff_receipts"),
  ]);
  if (
    user.error ||
    offers.error ||
    inbox.error ||
    trips.error ||
    receipts.error
  )
    throw new Error("Pool couldn’t load today’s rides. Try again.");
  const me = user.data.user?.id;
  const mine = [
    ...new Map(
      offers.data
        .filter(
          (offer) =>
            !offer.cancelled_at &&
            offer.status !== "declined" &&
            offer.status !== "withdrawn",
        )
        .map((offer) => [offer.id, offer]),
    ).values(),
  ];
  const todays = mine.filter((offer) => offer.starts_at < today.until);
  const later = mine.filter((offer) => offer.starts_at >= today.until);
  const ids = [
    ...new Set([
      ...trips.data.map((trip) => trip.ride_id),
      ...receipts.data.map((item) => item.ride_id),
      ...inbox.data.slice(0, 25).map((item) => item.ride_id),
      ...mine
        .filter((offer) => offer.status === "invited")
        .map((offer) => offer.id),
      ...todays.map((offer) => offer.id),
      ...later
        .filter(
          (offer) =>
            Date.parse(offer.starts_at) <
            Date.parse(today.until) + 7 * 86400_000,
        )
        .map((offer) => offer.id),
    ]),
  ].slice(0, 400);
  const families = [...new Set(mine.map((offer) => offer.family_id))];
  const none = { data: [], error: null };
  const [statuses, tripRows, handoffs, riders, members] =
    await Promise.all([
      ids.length ? client.rpc("driver_statuses", { p_ride_ids: ids }) : none,
      ids.length
        ? client
            .from("ride_trips")
            .select("ride_id,completed_at")
            .in("ride_id", ids)
        : none,
      ids.length
        ? client
            .from("ride_handoffs")
            .select("ride_id,child_id,status,recipient_id,version")
            .in("ride_id", ids)
        : none,
      ids.length
        ? client
            .from("ride_riders")
            .select("ride_id,child_id,family_id,display_name")
            .in("ride_id", ids)
            .order("display_name")
        : none,
      families.length
        ? client
            .from("family_members")
            .select("family_id,user_id")
            .in("family_id", families)
            .is("removed_at", null)
        : none,
    ]);
  if (
    statuses.error ||
    tripRows.error ||
    handoffs.error ||
    riders.error ||
    members.error
  )
    throw new Error("Pool couldn’t load today’s rides. Try again.");

  const allTrips = tripRows.data,
    allSteps = handoffs.data,
    allRiders = riders.data,
    allMembers = members.data;
  const offerBy = new Map(mine.map((offer) => [offer.id, offer]));
  const statusBy = new Map<string, DriverStatus>(
    [...inbox.data, ...statuses.data].map((status) => [status.ride_id, status]),
  );

  function card(id: string): { card: Card; needed: boolean } | null {
    const offer = offerBy.get(id);
    const status = statusBy.get(id);
    if (status?.cancelled_at || (!offer && !status)) return null;
    const ride: CardRide = offer ?? {
      ...status!,
      id,
      direction: "outbound",
    };
    const trip = allTrips.find((item) => item.ride_id === id);
    const started = Boolean(trip);
    const completed = Boolean(trip?.completed_at);
    const children = allRiders.filter((item) => item.ride_id === id);
    const child = (childId: string) =>
      children.find((item) => item.child_id === childId)?.display_name ??
      "your child";
    // Same order as the ride page (by name), so sentences never reshuffle.
    const steps = allSteps
      .filter((item) => item.ride_id === id)
      .sort((a, b) => child(a.child_id).localeCompare(child(b.child_id)));
    const base = rideSummary({
      familyStatus: offer?.status,
      // After the last handoff the driver is no longer "current".
      status:
        completed && status?.is_completed_driver
          ? { ...status, is_current_driver: true }
          : status,
      started,
      completed,
      awaitingReceipts: steps.filter((s) => s.status === "awaiting_handoff")
        .length,
      myReceipts: steps.filter(
        (s) => s.status === "awaiting_handoff" && s.recipient_id === me,
      ).length,
    });
    // A card in "Needs you" always wears the "your move" badge, named for
    // the move.
    const need = (
      label: string,
      detail: string,
      action?: Action,
      urgent = false,
    ) => ({
      card: {
        ride,
        summary: { label, tone: "act" as const, detail, mine: true },
        action,
        urgent,
      },
      needed: true,
    });
    const revision = String(offer?.revision ?? status?.ride_revision ?? 0);
    const step = (
      command: HandoffCommand,
      label: string,
      items: { child_id: string; version?: number }[],
      extra?: Record<string, string>,
    ): Action => ({
      kind: "step",
      command,
      label,
      rideId: id,
      revision,
      items: items.map((item) => ({
        child_id: item.child_id,
        version: item.version ?? 0,
        name: child(item.child_id),
      })),
      extra,
    });
    if (completed) return { card: { ride, summary: base }, needed: false };

    // 1. A child of mine has arrived and I am the one meeting them.
    const arrived = steps.filter(
      (s) => s.status === "awaiting_handoff" && s.recipient_id === me,
    );
    if (arrived.length) {
      const who = arrived.map((s) => child(s.child_id));
      return need(
        "Confirm handoff",
        arrived.length === 1
          ? `${who[0]} has arrived. Tap when ${who[0]} is with you.`
          : `${names(who)} have arrived. Tap when they are with you.`,
        step(
          "confirmHandoff",
          everyone(arrived.length, `I have ${who[0]}`, "I have them"),
          arrived,
        ),
        true,
      );
    }

    // 2. I am driving and it is time to pick up, or the trip is under way.
    if (status?.is_current_driver) {
      const toPickUp = steps.filter((s) => s.status === "scheduled");
      const inCar = steps.filter((s) => s.status === "picked_up");
      const ready = children.every((c) =>
        steps.some((s) => s.child_id === c.child_id),
      );
      const soon = Date.parse(ride.starts_at) - now <= pickupWindow;
      const pickup = () =>
        step(
          "recordPickup",
          everyone(
            toPickUp.length,
            `Picked up ${child(toPickUp[0].child_id)}`,
            "Picked up everyone",
          ),
          toPickUp,
        );
      if (started && toPickUp.length)
        return need(
          "Pick up",
          `Confirm pickup for ${names(toPickUp.map((s) => child(s.child_id)))}`,
          pickup(),
          true,
        );
      if (started && inCar.length)
        return need(
          "Drop off",
          `Confirm arrival for ${names(inCar.map((s) => child(s.child_id)))}`,
          step(
            "reportArrival",
            everyone(
              inCar.length,
              `Arrived with ${child(inCar[0].child_id)}`,
              "Arrived with everyone",
            ),
            inCar,
          ),
          true,
        );
      if (!started && soon && ready && toPickUp.length)
        return need(
          "Pick up",
          `Time to pick up ${names(toPickUp.map((s) => child(s.child_id)))}. After the first pickup, the ride can’t be changed.`,
          pickup(),
          true,
        );
    }
    if (started) return { card: { ride, summary: base }, needed: false };

    // 3. Someone asked me to drive.
    if (
      status?.is_driver &&
      status.proposal_status === "pending" &&
      !status.accepted_at
    )
      return need(
        "Your reply",
        status.coverage === "confirmed"
          ? `Can you take over from ${firstName(status.current_driver_name ?? "")}? You’d drive the ${status.vehicle_label}.`
          : `You were asked to drive the ${status.vehicle_label}`,
        { kind: "drive", status },
      );

    const own = offer
      ? children.filter((c) => c.family_id === offer.family_id)
      : [];

    // 4. My family has not replied to the ride.
    if (base.label === "Invited")
      return { card: { ride, summary: base }, needed: true };

    // 5. The ride has a driver, and my child still needs someone to meet them.
    if (offer?.status === "joined" && status?.coverage === "confirmed" && me) {
      const guardians = new Set(
        allMembers
          .filter((m) => m.family_id === offer.family_id)
          .map((m) => m.user_id),
      );
      const unmet = own.filter((c) => {
        const chosen = steps.find((s) => s.child_id === c.child_id);
        return !chosen || !guardians.has(chosen.recipient_id);
      });
      if (unmet.length)
        return need(
          "Who meets",
          `Say who meets ${names(unmet.map((c) => c.display_name))} at drop-off`,
          step(
            "designateRecipient",
            everyone(
              unmet.length,
              `I’ll meet ${unmet[0].display_name}`,
              "I’ll meet them",
            ),
            unmet.map((c) => ({
              child_id: c.child_id,
              version: steps.find((s) => s.child_id === c.child_id)?.version,
            })),
            { recipient_id: me },
          ),
        );
    }
    return { card: { ride, summary: base }, needed: false };
  }

  const cards = new Map(
    ids.flatMap((id) => {
      const result = card(id);
      return result ? [[id, result] as const] : [];
    }),
  );
  const byStart = (a: Card, b: Card) =>
    Number(Boolean(b.urgent)) - Number(Boolean(a.urgent)) ||
    a.ride.starts_at.localeCompare(b.ride.starts_at);
  const needs = [...cards.values()]
    .filter((item) => item.needed)
    .map((item) => item.card)
    .sort(byStart);
  const calm = (list: { id: string }[]) =>
    list.flatMap((ride) => {
      const item = cards.get(ride.id);
      return item && !item.needed ? [item.card] : [];
    });
  // Rides I drive today for other families have no family reply of my own.
  const drivingToday = [...statusBy.values()]
    .filter(
      (status) =>
        status.is_current_driver &&
        !offerBy.has(status.ride_id) &&
        status.starts_at < today.until &&
        status.ends_at > today.from,
    )
    .map((status) => ({ id: status.ride_id }));
  return {
    model: {
      date: rideDay(new Date(now).toISOString(), zone),
      needs,
      today: calm([...todays, ...drivingToday]).sort(byStart),
      ridesToday: todays.length + drivingToday.length,
      // The next seven days; the Schedule has the rest.
      comingUp: calm(
        later.filter(
          (offer) =>
            Date.parse(offer.starts_at) <
            Date.parse(today.until) + 7 * 86400_000,
        ),
      ),
      moreRequests: inbox.data.length > 25,
      moreTrips: trips.data.length === 100 ? trips.data[99].ride_id : undefined,
      after,
    },
  };
}

function CardAction({
  action,
  primary,
}: {
  action: Exclude<Action, { kind: "drive" }>;
  primary: boolean;
}) {
  return (
    <View style={{ flex: 1 }}>
      <HandoffAllForm
        command={action.command}
        rideId={action.rideId}
        revision={action.revision}
        items={action.items}
        extra={action.extra}
        label={action.label}
        emphasis={primary ? "primary" : "secondary"}
      />
    </View>
  );
}

function Cards({ cards, lead = false }: { cards: Card[]; lead?: boolean }) {
  // One primary button on the screen: the first thing this person can do.
  const first = lead ? cards.findIndex((item) => item.action) : -1;
  return (
    <UI.List className="ride-list">
      {cards.map(({ ride, summary, action }, index) => (
        <RideCard key={ride.id} ride={ride} summary={summary}>
          {!action ? undefined : action.kind === "drive" ? (
            <DriveReply status={action.status} primary={index === first} />
          ) : (
            <CardAction
              key={action.command}
              action={action}
              primary={index === first}
            />
          )}
        </RideCard>
      ))}
    </UI.List>
  );
}

const schedule = (
  <Link className="text-link" href="/app/schedule">
    Schedule
    <Icon name="arrow-right" size={16} color={colors.blue} />
  </Link>
);

const Today = createScreen(
  loadToday,
  ({
    date,
    needs,
    today,
    ridesToday,
    comingUp,
    moreRequests,
    moreTrips,
    after,
  }) => (
    <>
      <PageHeading title="Today">{date}</PageHeading>
      <UI.Box role="region" aria-label="Needs you">
        <UI.Box className="section-head" style={{ marginBottom: 0 }}>
          <UI.Heading2 aria-label="Needs you" style={{ marginBottom: 0 }}>
            Needs you
            {needs.length > 0 && (
              <>
                {" "}
                <UI.Inline className="number" aria-hidden="true">
                  {needs.length}
                </UI.Inline>
              </>
            )}
          </UI.Heading2>
        </UI.Box>
        {needs.length ? (
          <Cards cards={needs} lead />
        ) : (
          <UI.Paragraph
            role="status"
            className="notice"
            style={{ marginBottom: spacing.xxl }}
          >
            Nothing needs you right now.
          </UI.Paragraph>
        )}
        {moreRequests && (
          <Link className="text-link" href="/app/driving?pending=1">
            Show all driver requests
            <Icon name="arrow-right" size={16} color={colors.blue} />
          </Link>
        )}
        {moreTrips && (
          <Link
            className="text-link"
            href={`/app/attention?after_trip=${moreTrips}`}
          >
            Show more
            <Icon name="arrow-right" size={16} color={colors.blue} />
          </Link>
        )}
        {after && (
          <Link className="text-link" href="/app/attention">
            Back to the start
          </Link>
        )}
      </UI.Box>
      <UI.Box role="region" aria-label="Rides today">
        <UI.Box className="section-head" style={{ marginBottom: 0 }}>
          <UI.Heading2 style={{ marginBottom: 0 }}>Rides today</UI.Heading2>
          {!comingUp.length && schedule}
        </UI.Box>
        {today.length ? (
          <Cards cards={today} />
        ) : ridesToday || needs.length ? (
          <UI.Paragraph style={{ marginBottom: spacing.xxl }}>
            {ridesToday ? "No other rides today." : "No rides today."}
          </UI.Paragraph>
        ) : (
          <UI.Section>
            <EmptyState
              icon="calendar"
              title="No rides today"
              href="/app/rides/new"
              action="Plan a ride"
            >
              Plan one, or wait for another family to invite yours.
            </EmptyState>
          </UI.Section>
        )}
      </UI.Box>
      {comingUp.length > 0 && (
        <UI.Box role="region" aria-label="Coming up">
          <UI.Box className="section-head" style={{ marginBottom: 0 }}>
            <UI.Box>
              <UI.Heading2 style={{ marginBottom: 0 }}>Coming up</UI.Heading2>
              <UI.Small className="section-caption">Next 7 days</UI.Small>
            </UI.Box>
            {schedule}
          </UI.Box>
          <Cards cards={comingUp} />
        </UI.Box>
      )}
    </>
  ),
);
export default Today;
