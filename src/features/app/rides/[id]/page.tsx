import { Fragment } from "react";
import { View, useWindowDimensions } from "react-native";
import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import Link from "@/ui/link";
import { colors, spacing, styles } from "@/ui/styles";
import {
  ActionDialog,
  PageHeading,
  StatusBadge,
  RouteSummary,
  Disclosure,
} from "../../presentation";
import { notFound } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/client";
import { rideTimeShort, rideWhen } from "@/lib/rides";
import { rideSummary } from "@/lib/ride-state";
import { RideForm, ChildChoices, AddChildSheet } from "../../ride-form";
import { AddVehicleForm, DriverForm } from "../../driver-form";
import { AskDriverForm } from "../../ride-vehicles";
import { HandoffPanel } from "../../handoff-panel";
import { HomeDriverOffer, type OfferCar } from "../../home-driver-offer";
import {
  DriverMore,
  DriverReply,
  DriverSummary,
  driverOptions,
  driverRequestLine,
  loadAssignedVehicle,
} from "../../driver-panel";
import { ReplacementPanel } from "../../replacement-panel";

const plain = { marginVertical: 0 } as const;
const cardTitle = { marginBottom: 0 } as const;
const stack = { gap: spacing.md } as const;
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const listed = (names: string[]) =>
  names.length < 3
    ? names.join(" and ")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
// "The Chens" reads as "the Chens" in the middle of a sentence.
const midSentence = (name: string) => name.replace(/^The /, "the ");
const seatWords = (seat: string) =>
  seat === "booster"
    ? "Booster"
    : seat === "child-seat"
      ? "Child seat"
      : "Regular seat";
const replyWords = (reply: string) =>
  reply === "invited"
    ? "Hasn’t replied"
    : reply === "declined"
      ? "Declined"
      : reply === "joined"
        ? ""
        : "Not riding";

async function loadRideDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ family?: string; after_replacement?: string }>;
}) {
  const { id } = await params;
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) notFound();
  const query = await searchParams;
  const client = await createClient();
  const offers = await client.rpc("ride_offer", { p_id: id });
  if (offers.error) throw new Error("Pool couldn’t load this ride. Try again.");
  const offer =
    offers.data.find((item) => item.family_id === query.family) ??
    (!query.family ? offers.data[0] : undefined);
  const driving = await client.rpc("driver_status", { p_ride_id: id });
  if (driving.error)
    throw new Error("Pool couldn’t load this ride’s driver. Try again.");
  const status = driving.data[0];
  const [trip, handoffs] = await Promise.all([
    client
      .from("ride_trips")
      .select("completed_at")
      .eq("ride_id", id)
      .maybeSingle(),
    client
      .from("ride_handoffs")
      .select("status,recipient_id")
      .eq("ride_id", id),
  ]);
  if (trip.error || handoffs.error)
    throw new Error("Pool couldn’t load this ride. Try again.");
  const started = Boolean(trip.data);
  const completed = Boolean(trip.data?.completed_at);
  const awaitingReceipts = handoffs.data.filter(
    (item) => item.status === "awaiting_handoff",
  ).length;
  const now = Date.now();

  // A driver from outside the riding families sees the ride through the request.
  if (
    !offer &&
    (status?.is_driver ||
      status?.is_current_driver ||
      status?.is_completed_driver)
  ) {
    const [exact, enrolled, assignedVehicle] = await Promise.all([
      client
        .from("ride_locations")
        .select("pickup,destination")
        .eq("ride_id", id)
        .maybeSingle(),
      client
        .from("ride_riders")
        .select("child_id,display_name,seat_requirement")
        .eq("ride_id", id)
        .order("display_name"),
      loadAssignedVehicle(client, status),
    ]);
    if (exact.error || enrolled.error)
      throw new Error("Pool couldn’t load this ride. Try again.");
    const summary = rideSummary({
      cancelled: Boolean(status.cancelled_at),
      status,
      started,
      completed,
      awaitingReceipts,
    });
    const asked =
      status.proposal_status === "pending" &&
      !status.accepted_at &&
      status.is_driver &&
      !status.cancelled_at &&
      !started;
    const more = driverOptions(status, {
      started,
      upcoming: Date.parse(status.starts_at) > now,
      assignedVehicle,
    });
    // On the day, the trip's own steps lead.
    const underway = started && !completed;
    const { tripCard, card } = tripFirst(underway);
    const trip = tripCard(
      exact.data && (
        <HandoffPanel
          rideId={id}
          revision={status.ride_revision}
          timezone={status.timezone}
          isDriver={status.is_current_driver}
          cancelled={Boolean(status.cancelled_at)}
        />
      ),
    );
    const cards = [
      card(
        "driver",
        !status.cancelled_at && (
          <UI.Section>
            <View style={stack}>
              <UI.Heading2 style={cardTitle}>Driver</UI.Heading2>
              <DriverSummary
                status={status}
                completed={completed}
                assignedVehicle={assignedVehicle}
              />
            </View>
          </UI.Section>
        ),
      ),
      card(
        "riders",
        exact.data && enrolled.data.length > 0 && (
          <UI.Section>
            <UI.Heading2>Riders</UI.Heading2>
            {enrolled.data.map((rider) => (
              <RiderRow
                key={rider.child_id}
                name={rider.display_name}
                seat={rider.seat_requirement}
              />
            ))}
          </UI.Section>
        ),
      ),
      card(
        "where",
        <UI.Section>
          <UI.Heading2 style={cardTitle}>Where</UI.Heading2>
          <RouteSummary
            pickup={exact.data?.pickup ?? status.pickup_summary}
            destination={exact.data?.destination ?? status.destination_summary}
          />
          {!exact.data && (
            <UI.Paragraph style={plain}>
              You’ll see the addresses and who’s riding once you’re the driver.
            </UI.Paragraph>
          )}
        </UI.Section>,
      ),
    ];
    return {
      early: (
        <>
          <PageHeading
            title={`${status.pickup_summary} → ${status.destination_summary}`}
            action={
              <StatusBadge tone={summary.tone}>{summary.label}</StatusBadge>
            }
          >
            {rideWhen(status.starts_at, status.ends_at, status.timezone)}
          </PageHeading>
          {asked ? (
            <NextStep
              title={
                status.coverage === "confirmed"
                  ? "Can you take over driving?"
                  : "Can you drive this ride?"
              }
            >
              <UI.Paragraph style={plain}>
                {driverRequestLine(status)}
              </UI.Paragraph>
              <DriverReply status={status} />
            </NextStep>
          ) : (
            <UI.Paragraph style={{ marginTop: 0 }}>
              {summary.detail}
            </UI.Paragraph>
          )}
          {underway ? [trip, ...cards] : [...cards, trip]}
          {(more.changeCar || more.stepBack) && (
            <Disclosure title="More">
              <DriverMore
                status={status}
                options={more}
                assignedVehicle={assignedVehicle}
              />
            </Disclosure>
          )}
        </>
      ),
    };
  }
  if (!offer)
    return {
      early: (
        <>
          <UI.Heading1>Ride unavailable</UI.Heading1>
          <UI.Paragraph>
            You can’t open this ride. It may have been removed, or your family
            is no longer in its circle.
          </UI.Paragraph>
          <Link className="text-link" href="/app/schedule">
            Go to the schedule
          </Link>
        </>
      ),
    };
  const [
    session,
    families,
    children,
    locations,
    riders,
    participation,
    roster,
    options,
    offerDetails,
    vehicles,
  ] = await Promise.all([
    client.auth.getSession(),
    client.from("families").select("id,name"),
    client
      .from("children")
      .select("id,display_name")
      .eq("family_id", offer.family_id)
      .order("display_name"),
    client
      .from("ride_locations")
      .select("pickup,destination")
      .eq("ride_id", id)
      .maybeSingle(),
    client
      .from("ride_riders")
      .select("family_id,child_id,display_name,seat_requirement")
      .eq("ride_id", id)
      .order("display_name"),
    client.from("ride_families").select("family_id,status").eq("ride_id", id),
    client.rpc("circle_roster", { p_circle_id: offer.circle_id }),
    client.rpc("driver_options", { p_ride_id: id }),
    client.rpc("drive_offer_details", { p_ride_ids: [id] }),
    client
      .from("vehicles")
      .select("id,label,version,passenger_seats")
      .is("retired_at", null)
      .order("passenger_seats", { ascending: false })
      .order("label")
      .order("id"),
  ]);
  if (
    families.error ||
    children.error ||
    locations.error ||
    riders.error ||
    participation.error ||
    roster.error ||
    options.error ||
    vehicles.error ||
    // The ride still loads before the database can say who may offer to drive.
    (offerDetails.error && offerDetails.error.code !== "PGRST202")
  )
    throw new Error("Pool couldn’t load this ride. Try again.");
  const assignedVehicle = status
    ? await loadAssignedVehicle(client, status, options.data)
    : undefined;
  const familyNames = new Map<string, string>([
    ...roster.data.map((item) => [item.family_id, item.family_name] as const),
    ...families.data.map((item) => [item.id, item.name] as const),
  ]);
  return {
    model: {
      id,
      after: query.after_replacement,
      contexts: offers.data.map((item) => item.family_id),
      offer,
      status,
      started,
      completed,
      awaitingReceipts,
      // Children who have arrived and wait for this guardian to confirm.
      myReceipts: handoffs.data.filter(
        (item) =>
          item.status === "awaiting_handoff" &&
          item.recipient_id === session.data.session?.user.id,
      ).length,
      upcoming: Date.parse(offer.starts_at) > now,
      userId: session.data.session?.user.id,
      children: children.data,
      exact: locations.data,
      riders: riders.data,
      participation: participation.data,
      options: options.data,
      offerDetails: offerDetails.data?.[0],
      cars: vehicles.data as OfferCar[],
      assignedVehicle,
      familyNames,
    },
  };
}

// The one thing this person has to do, in the attention tone. A ride shows at
// most one of these, and it holds the screen's only primary button.
function NextStep({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <UI.Section
      className="attention"
      role="region"
      aria-label="Your next step"
      style={{ marginTop: 0, borderWidth: 0 }}
    >
      <UI.Heading2 style={{ marginBottom: spacing.xs, color: colors.ink }}>
        {title}
      </UI.Heading2>
      {children}
    </UI.Section>
  );
}

function RiderRow({ name, seat }: { name: string; seat: string }) {
  return (
    <View
      style={[
        styles.row,
        { justifyContent: "space-between", paddingVertical: spacing.xs },
      ]}
    >
      <UI.Inline>{name}</UI.Inline>
      <UI.Small style={{ color: colors.muted }}>{seatWords(seat)}</UI.Small>
    </View>
  );
}

// Phone: one column in reading order. Wide screens: what to do and who drives
// on the left, where and who rides on the right.
function Layout({
  lead,
  driver,
  riders,
  where,
  trip,
  more,
  underway,
}: Record<
  "lead" | "driver" | "riders" | "where" | "trip" | "more",
  React.ReactNode
> & { underway: boolean }) {
  const { width } = useWindowDimensions();
  const { tripCard, card } = tripFirst(underway);
  // On the day, the trip's own steps lead.
  if (width <= 900)
    return underway
      ? [
          tripCard(trip),
          card("driver", driver),
          card("riders", riders),
          card("where", where),
          card("more", more),
        ]
      : [
          card("lead", lead),
          card("driver", driver),
          card("riders", riders),
          card("where", where),
          tripCard(trip),
          card("more", more),
        ];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: spacing.xl,
      }}
    >
      <View style={{ flex: 3, minWidth: 0 }}>
        {underway
          ? [tripCard(trip), card("driver", driver), card("more", more)]
          : [
              card("lead", lead),
              card("driver", driver),
              tripCard(trip),
              card("more", more),
            ]}
      </View>
      <View style={{ flex: 2, minWidth: 0 }}>
        {where}
        {riders}
      </View>
    </View>
  );
}

// The Trip card moves to the top at the first pickup and back down after the
// last handoff. It has to stay the same element through both moves, or the
// step someone just pressed loses keyboard focus. So the Trip card keeps one
// key, and the cards around it are keyed by phase and re-created instead.
function tripFirst(underway: boolean) {
  const phase = underway ? "underway" : "planned";
  return {
    tripCard: (node: React.ReactNode) => <Fragment key="trip">{node}</Fragment>,
    card: (name: string, node: React.ReactNode) => (
      <Fragment key={`${name}-${phase}`}>{node}</Fragment>
    ),
  };
}

const RideDetail = createScreen(
  loadRideDetail,
  ({
    id,
    after,
    contexts,
    offer,
    status,
    started,
    completed,
    awaitingReceipts,
    myReceipts,
    upcoming,
    userId,
    children,
    exact,
    riders,
    participation,
    options,
    offerDetails,
    cars,
    assignedVehicle,
    familyNames,
  }) => {
    const familyName = (familyId: string) =>
      familyNames.get(familyId) ?? "Another family";
    const cancelled = Boolean(offer.cancelled_at);
    const joined = offer.status === "joined";
    const live = status?.proposal_status === "pending";
    const covered = status?.coverage === "confirmed";
    // A family can change its own riders until the first pickup. The driver
    // is told; nobody has to approve again.
    const locked = started;
    const open = !cancelled && !started;
    const fields = {
      ride_id: id,
      family_id: offer.family_id,
      revision: String(offer.revision),
    };
    const ownRiders = riders.filter((r) => r.family_id === offer.family_id);
    const notReplied = participation
      .filter((p) => p.status === "invited" && p.family_id !== offer.family_id)
      .map((p) => midSentence(familyName(p.family_id)));
    const summary = rideSummary({
      familyStatus: offer.status,
      cancelled,
      status,
      started,
      completed,
      awaitingReceipts,
      myReceipts,
    });

    const asked =
      open && live && Boolean(status?.is_driver) && !status?.accepted_at;
    const takeover = live && covered;
    const carChange =
      takeover &&
      (assignedVehicle?.driverId === status?.driver_id ||
        Boolean(status?.is_current_driver && status?.is_driver));
    const holder = status
      ? firstName(status.current_driver_name || status.driver_name)
      : "";
    const driver = status ? firstName(status.driver_name) : "";

    const joinForm = (
      <>
        {children.length ? (
          <RideForm
            key={`${offer.family_id}-${offer.revision}`}
            command="respondToRideInvitation"
            fields={{ ...fields, response: "join" }}
            label="Join ride"
            after="toast"
          >
            <ChildChoices selectOnly>{children}</ChildChoices>
            <AddChildSheet familyId={offer.family_id} />
          </RideForm>
        ) : (
          <>
            <UI.Paragraph style={[plain, { color: colors.ink }]}>
              Add a child to put them on this ride.
            </UI.Paragraph>
            <AddChildSheet familyId={offer.family_id} />
          </>
        )}
      </>
    );

    const step =
      open && offer.status === "invited" ? (
        <NextStep title="Are your children joining this ride?">
          {covered && status && (
            <UI.Paragraph style={[plain, { color: colors.ink }]}>
              {`${holder} is driving the ${assignedVehicle?.label || status.vehicle_label}.`}
            </UI.Paragraph>
          )}
          {joinForm}
          <RideForm
            command="respondToRideInvitation"
            fields={{ ...fields, response: "decline" }}
            label="Decline"
            tone="quiet"
            after="toast"
          />
        </NextStep>
      ) : asked && status ? (
        <NextStep
          title={
            carChange
              ? "Finish your car change"
              : takeover
                ? "Can you take over driving?"
                : "Can you drive this ride?"
          }
        >
          <UI.Paragraph style={[plain, { color: colors.ink }]}>
            {driverRequestLine(status)}
          </UI.Paragraph>
          <DriverReply status={status} carChange={carChange} />
        </NextStep>
      ) : null;

    const others = options.filter(
      (option) =>
        option.driver_id !== userId && option.passenger_seats >= riders.length,
    );
    const noDriver = !covered && !live && !completed;
    const droppedOut =
      status?.current_assignment_release_reason === "withdrawn" &&
      status.mode !== "unavailable";
    // The line under the title. The Driver card already says who dropped out,
    // so that part is not repeated; unanswered invitations still show.
    const waitingOn =
      noDriver && joined && open && notReplied.length
        ? `${listed(notReplied)} ${notReplied.length === 1 ? "hasn’t" : "haven’t"} replied yet`
        : "";
    const lead = [noDriver && droppedOut ? "" : summary.detail, waitingOn]
      .filter(Boolean)
      .join(" · ");
    const tooSmall =
      cars.length > 0 &&
      cars.every((car) => car.passenger_seats < riders.length);
    const driverCard =
      cancelled || (!joined && !status) ? null : (
        <UI.Section>
          <View style={stack}>
            <UI.Heading2 style={cardTitle}>Driver</UI.Heading2>
            <DriverSummary
              status={status}
              completed={completed}
              assignedVehicle={assignedVehicle}
            >
              {noDriver &&
                joined &&
                open &&
                (upcoming ? (
                  <>
                    <View style={styles.actionRow}>
                      {offerDetails ? (
                        <HomeDriverOffer
                          details={offerDetails}
                          familyId={offer.family_id}
                          cars={cars}
                          rideLabel={`${rideTimeShort(offer.starts_at, offer.timezone)} · ${offer.pickup_summary} → ${offer.destination_summary}`}
                          primary
                        />
                      ) : (
                        !cars.length && (
                          <ActionDialog
                            title="Add your car"
                            triggerLabel="Add a car to drive"
                            tone="primary"
                          >
                            <UI.Paragraph style={{ marginTop: 0 }}>
                              Add the car you’d drive, then you can offer to
                              take this ride.
                            </UI.Paragraph>
                            <AddVehicleForm />
                          </ActionDialog>
                        )
                      )}
                      <ActionDialog title="Ask someone else">
                        <AskDriverForm
                          command="proposeDriver"
                          fields={fields}
                          options={others}
                          outcome={(name) =>
                            `The ride is set as soon as ${name} says yes.`
                          }
                        />
                      </ActionDialog>
                    </View>
                    {tooSmall && (
                      <UI.Small style={{ color: colors.muted }}>
                        Your car doesn’t have a seat for every rider.
                      </UI.Small>
                    )}
                  </>
                ) : null)}
              {covered && joined && open && upcoming && status && (
                <View style={styles.actionRow}>
                  <ReplacementPanel
                    status={status}
                    familyId={offer.family_id}
                    revision={offer.revision}
                    frozen={started}
                    // Asking is for someone else; nobody asks themselves.
                    options={options.filter(
                      (option) => option.driver_id !== userId,
                    )}
                    after={after}
                    show="ask"
                  />
                </View>
              )}
            </DriverSummary>
          </View>
        </UI.Section>
      );

    const groups = participation
      .map((p) => ({
        id: p.family_id,
        name: familyName(p.family_id),
        reply: replyWords(p.status),
        riders: riders.filter((r) => r.family_id === p.family_id),
        mine: p.family_id === offer.family_id,
      }))
      .sort((a, b) => Number(b.mine) - Number(a.mine));
    const ridersCard = exact ? (
      <UI.Section>
        <View style={stack}>
          <UI.Heading2 style={cardTitle}>Riders</UI.Heading2>
          {groups.map((group) => (
            <View key={group.id}>
              <UI.Inline className="meta-label">
                {group.reply ? `${group.name} · ${group.reply}` : group.name}
              </UI.Inline>
              {group.riders.map((rider) => (
                <RiderRow
                  key={rider.child_id}
                  name={rider.display_name}
                  seat={rider.seat_requirement}
                />
              ))}
            </View>
          ))}
          {joined && open && !locked && (
            <View style={styles.actionRow}>
              <ActionDialog
                title="Change riders"
                tone="quiet"
                triggerStyle={{ paddingHorizontal: 0 }}
              >
                <RideForm
                  key={`${offer.family_id}-${offer.revision}`}
                  command="setOwnRideRiders"
                  fields={fields}
                  label="Save riders"
                >
                  <ChildChoices selected={ownRiders.map((r) => r.child_id)}>
                    {children}
                  </ChildChoices>
                  <UI.Paragraph style={[plain, styles.small]}>
                    {covered
                      ? `Untick every child to take your family off this ride. ${
                          status?.is_current_driver ? "The other families see" : `${holder} sees`
                        } the change.`
                      : "Untick every child to take your family off this ride."}
                  </UI.Paragraph>
                </RideForm>
              </ActionDialog>
              <AddChildSheet familyId={offer.family_id} />
            </View>
          )}
        </View>
      </UI.Section>
    ) : null;

    const whereCard = (
      <UI.Section>
        <UI.Heading2 style={cardTitle}>Where</UI.Heading2>
        <RouteSummary
          pickup={exact?.pickup ?? offer.pickup_summary}
          destination={exact?.destination ?? offer.destination_summary}
        />
        {!exact && (
          <UI.Paragraph style={plain}>
            Join to see addresses and who’s riding.
          </UI.Paragraph>
        )}
      </UI.Section>
    );

    const rejoin =
      open && !locked && upcoming && !joined && offer.status !== "invited" ? (
        <UI.Section>
          <View style={stack}>
            <UI.Heading2 style={cardTitle}>Join after all</UI.Heading2>
            {joinForm}
          </View>
        </UI.Section>
      ) : null;

    const trip = exact ? (
      <HandoffPanel
        rideId={id}
        revision={offer.revision}
        timezone={offer.timezone}
        isDriver={Boolean(status?.is_current_driver)}
        cancelled={cancelled}
      />
    ) : null;

    const driverMore = status
      ? driverOptions(status, { started, upcoming, assignedVehicle })
      : null;
    const canCancelRequest = joined && open && live;
    const canCancelRide = offer.can_cancel && open;
    const hasMore =
      Boolean(
        driverMore?.changeCar ||
        driverMore?.stepBack ||
        driverMore?.waitingOnSwap,
      ) ||
      canCancelRequest ||
      canCancelRide ||
      // What came of earlier driver changes.
      (joined && Boolean(status) && status?.mode !== "initial");
    const more = hasMore ? (
      <Disclosure title="More" open={Boolean(after)}>
        {status && driverMore && (
          <DriverMore
            status={status}
            options={driverMore}
            assignedVehicle={assignedVehicle}
          />
        )}
        {canCancelRequest && status && (
          <ActionDialog title="Cancel driver request" tone="danger">
            <UI.Paragraph style={{ marginTop: 0 }}>
              {takeover
                ? `${status.is_current_driver ? "You keep" : `${holder} keeps`} driving.`
                : `${status.is_driver ? "You" : driver} won’t be asked to drive, and this ride will need a driver.`}
            </UI.Paragraph>
            <DriverForm
              command="cancelDriverProposal"
              fields={{
                proposal_id: status.proposal_id,
                revision: String(status.ride_revision),
                family_id: offer.family_id,
              }}
              label="Cancel request"
              tone="danger"
            />
          </ActionDialog>
        )}
        {canCancelRide && (
          <ActionDialog title="Cancel ride" tone="danger">
            <UI.Paragraph style={{ marginTop: 0 }}>
              This cancels the ride for every family. It can’t be undone.
            </UI.Paragraph>
            <RideForm
              command="cancelRide"
              fields={fields}
              label="Cancel ride"
              tone="danger"
            >
              <UI.Label className="checkbox-label">
                <UI.Field type="checkbox" name="confirm" value="yes" required />
                Cancel for every family
              </UI.Label>
            </RideForm>
          </ActionDialog>
        )}
        {status && joined && (
          <ReplacementPanel
            status={status}
            familyId={offer.family_id}
            revision={offer.revision}
            frozen={started}
            options={[]}
            after={after}
            show="history"
          />
        )}
      </Disclosure>
    ) : null;

    return (
      <>
        <PageHeading
          title={`${offer.pickup_summary} → ${offer.destination_summary}`}
          action={
            <StatusBadge tone={summary.tone}>{summary.label}</StatusBadge>
          }
        >
          {rideWhen(offer.starts_at, offer.ends_at, offer.timezone)}
          {offer.direction === "return" ? " · Return" : ""}
        </PageHeading>
        {contexts.length > 1 && (
          <UI.Nav aria-label="Your families">
            {contexts.map((familyId) => (
              <Link
                key={familyId}
                aria-current={familyId === offer.family_id ? "page" : undefined}
                href={`/app/rides/${id}?family=${familyId}`}
              >
                {familyName(familyId)}
              </Link>
            ))}
          </UI.Nav>
        )}
        {/* The Driver card already says who is driving a covered ride. */}
        {!step && summary.tone !== "set" && lead && (
          <UI.Paragraph style={{ marginTop: 0 }}>{lead}</UI.Paragraph>
        )}
        <Layout
          lead={
            <>
              {step}
              {rejoin}
            </>
          }
          driver={driverCard}
          riders={ridersCard}
          where={whereCard}
          trip={trip}
          more={more}
          underway={started && !completed}
        />
      </>
    );
  },
);
export default RideDetail;
