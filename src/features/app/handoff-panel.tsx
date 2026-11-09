import { newRequestId } from "@/lib/request-id";
import * as UI from "@/ui/elements";
import { createPanel } from "@/ui/remote";
import { createClient } from "@/lib/supabase/client";
import { progressLabel } from "@/lib/handoffs";
import { rideTime } from "@/lib/rides";
import { HandoffForm } from "./handoff-form";
import { Disclosure, StatusBadge } from "./presentation";
import { Confirmation } from "./driver-form";
async function loadHandoffPanel({
  rideId,
  revision,
  timezone,
  isDriver,
  cancelled,
}: {
  rideId: string;
  revision: number;
  timezone: string;
  isDriver: boolean;
  cancelled: boolean;
}) {
  const client = await createClient();
  const [user, riders, handoffs, trip, events] = await Promise.all([
    client.auth.getUser(),
    client
      .from("ride_riders")
      .select("child_id,family_id,display_name")
      .eq("ride_id", rideId)
      .order("display_name"),
    client.from("ride_handoffs").select("*").eq("ride_id", rideId),
    client.from("ride_trips").select("*").eq("ride_id", rideId).maybeSingle(),
    client
      .from("ride_events")
      .select("*")
      .eq("ride_id", rideId)
      .order("occurred_at")
      .order("child_id"),
  ]);
  if (
    riders.error ||
    handoffs.error ||
    trip.error ||
    events.error ||
    user.error
  )
    throw new Error("Trip progress could not be loaded");
  if (!riders.data.length) return { early: null };
  const guardians = await client
    .from("family_members")
    .select("family_id,user_id")
    .in("family_id", [...new Set(riders.data.map((r) => r.family_id))])
    .is("removed_at", null);
  if (guardians.error) throw new Error("Guardians could not be loaded");
  const profiles = await client
    .from("profiles")
    .select("id,display_name")
    .in("id", [...new Set(guardians.data.map((g) => g.user_id))]);
  if (profiles.error) throw new Error("Guardian names could not be loaded");
  const actor = user.data.user?.id;
  const started = Boolean(trip.data);
  const awaiting = handoffs.data.filter(
    (h) => h.status === "awaiting_handoff",
  ).length;
  const ownFamilies = new Set(
    guardians.data.filter((g) => g.user_id === actor).map((g) => g.family_id),
  );
  // Keep each child's position stable while reports are saved, with the adult's
  // own family first. Moving a focused child after a report can lose focus.
  const orderedRiders = [...riders.data].sort(
    (a, b) =>
      Number(ownFamilies.has(b.family_id)) -
      Number(ownFamilies.has(a.family_id)),
  );
  return {
    model: {
      rideId,
      revision,
      timezone,
      isDriver,
      cancelled,
      riders,
      handoffs,
      trip,
      events,
      guardians,
      profiles,
      actor,
      started,
      awaiting,
      orderedRiders,
    },
  };
}

export const HandoffPanel = createPanel(
  "loadHandoffPanel",
  loadHandoffPanel,
  ({
    rideId,
    revision,
    timezone,
    isDriver,
    cancelled,
    riders,
    handoffs,
    trip,
    events,
    guardians,
    profiles,
    actor,
    started,
    awaiting,
    orderedRiders,
  }) => (
    <UI.Section aria-labelledby="trip-progress">
      <UI.Heading2 id="trip-progress">Pickup and handoffs</UI.Heading2>
      <UI.Paragraph className="section-caption">
        Manually reported · Reload for updates
      </UI.Paragraph>
      <UI.Paragraph
        role="status"
        className={`notice${awaiting ? " attention" : ""}`}
      >
        {trip.data?.completed_at
          ? "Ride completed — every child’s handoff is confirmed."
          : awaiting
            ? `${awaiting} ${awaiting === 1 ? "child awaits" : "children await"} guardian receipt. The ride is not complete.`
            : started
              ? "Trip in progress — handoffs remain."
              : "Before pickup · Designate a receiving guardian for each child."}
      </UI.Paragraph>
      <UI.List className="journey-list">
        {orderedRiders.map((rider) => {
          const h = handoffs.data.find(
            (item) => item.child_id === rider.child_id,
          );
          const own = guardians.data.some(
            (g) => g.family_id === rider.family_id && g.user_id === actor,
          );
          const fields = {
            ride_id: rideId,
            child_id: rider.child_id,
            revision: String(revision),
            version: String(h?.version ?? 0),
          };
          const recipient = h?.recipient_id === actor && own;
          return (
            <UI.ListItem key={rider.child_id}>
              <UI.Article aria-label={`Journey for ${rider.display_name}`}>
                <UI.Heading3
                  id={`journey-${rideId}-${rider.child_id}`}
                  tabIndex={-1}
                >
                  {rider.display_name}
                </UI.Heading3>
                <UI.Paragraph aria-live="polite" aria-atomic="true">
                  <StatusBadge
                    tone={
                      h?.status === "awaiting_handoff"
                        ? "attention"
                        : h?.status === "completed"
                          ? "positive"
                          : "neutral"
                    }
                  >
                    <UI.Strong>{progressLabel(h?.status)}</UI.Strong>
                  </StatusBadge>
                </UI.Paragraph>
                <UI.Paragraph>
                  Receiving guardian: {h?.recipient_name ?? "Not designated"}
                </UI.Paragraph>
                {!started &&
                  own &&
                  h &&
                  !guardians.data.some(
                    (g) =>
                      g.family_id === rider.family_id &&
                      g.user_id === h.recipient_id,
                  ) && (
                    <UI.Paragraph role="alert">
                      The designated guardian is no longer active. Choose a
                      current guardian before pickup.
                    </UI.Paragraph>
                  )}
                {!started && !cancelled && own && (
                  <Disclosure
                    title={
                      h?.recipient_id
                        ? "Change receiving guardian"
                        : "Choose receiving guardian"
                    }
                    open={!h?.recipient_id}
                  >
                    <HandoffForm
                      key={`recipient-${rider.child_id}`}
                      command="designateRecipient"
                      fields={fields}
                      label="Save designated guardian"
                    >
                      <UI.Label>
                        Designated guardian for {rider.display_name}
                        <UI.Select
                          key={h?.recipient_id ?? "none"}
                          name="recipient_id"
                          defaultValue={h?.recipient_id ?? ""}
                          required
                        >
                          <UI.Option value="" disabled>
                            Choose an active guardian
                          </UI.Option>
                          {guardians.data
                            .filter((g) => g.family_id === rider.family_id)
                            .map((g) => (
                              <UI.Option key={g.user_id} value={g.user_id}>
                                {profiles.data.find((p) => p.id === g.user_id)
                                  ?.display_name ?? "Guardian"}
                                {g.user_id === actor ? " (you)" : ""}
                              </UI.Option>
                            ))}
                        </UI.Select>
                      </UI.Label>
                      <Confirmation>
                        I designate this guardian to receive{" "}
                        {rider.display_name}. A guardian who drives must still
                        explicitly confirm receipt.
                      </Confirmation>
                    </HandoffForm>
                  </Disclosure>
                )}
                {!cancelled && isDriver && h?.status === "scheduled" && (
                  <HandoffForm
                    key={`pickup-${rider.child_id}-${h.version}`}
                    command="recordPickup"
                    fields={{ ...fields, request_id: newRequestId() }}
                    label="Report pickup"
                  >
                    <Confirmation>
                      I report that I picked up {rider.display_name}. First
                      pickup freezes this ride’s plan and responsibilities.
                    </Confirmation>
                  </HandoffForm>
                )}
                {!cancelled && isDriver && h?.status === "picked_up" && (
                  <HandoffForm
                    key={`arrival-${rider.child_id}-${h.version}`}
                    command="reportArrival"
                    fields={{ ...fields, request_id: newRequestId() }}
                    label="Report arrival"
                  >
                    <Confirmation>
                      I report arrival for {rider.display_name}. Arrival does
                      not confirm guardian receipt.
                    </Confirmation>
                  </HandoffForm>
                )}
                {!cancelled &&
                  recipient &&
                  h?.status === "awaiting_handoff" && (
                    <HandoffForm
                      key={`receipt-${rider.child_id}-${h.version}`}
                      command="confirmHandoff"
                      fields={{ ...fields, request_id: newRequestId() }}
                      label="Confirm child received"
                    >
                      <Confirmation>
                        I explicitly confirm that I have received{" "}
                        {rider.display_name}.
                      </Confirmation>
                    </HandoffForm>
                  )}
                {h?.status === "awaiting_handoff" && !recipient && (
                  <UI.Paragraph>
                    Awaiting explicit receipt from {h.recipient_name}.
                  </UI.Paragraph>
                )}
                {(h?.picked_up_at || h?.arrived_at || h?.completed_at) && (
                  <Disclosure title="Report times">
                    {h?.picked_up_at && (
                      <UI.Paragraph>
                        Pickup reported:{" "}
                        <UI.Inline dateTime={h.picked_up_at}>
                          {rideTime(h.picked_up_at, timezone)}
                        </UI.Inline>
                      </UI.Paragraph>
                    )}
                    {h?.arrived_at && (
                      <UI.Paragraph>
                        Arrival reported:{" "}
                        <UI.Inline dateTime={h.arrived_at}>
                          {rideTime(h.arrived_at, timezone)}
                        </UI.Inline>
                        .{" "}
                        {h.status !== "completed" &&
                          "Guardian receipt is still required."}
                      </UI.Paragraph>
                    )}
                    {h?.completed_at && (
                      <UI.Paragraph>
                        Receipt confirmed:{" "}
                        <UI.Inline dateTime={h.completed_at}>
                          {rideTime(h.completed_at, timezone)}
                        </UI.Inline>
                      </UI.Paragraph>
                    )}
                  </Disclosure>
                )}
              </UI.Article>
            </UI.ListItem>
          );
        })}
      </UI.List>
      <Disclosure title="Ride activity">
        <UI.Heading3>Ride activity</UI.Heading3>
        {events.data.length ? (
          <UI.List className="activity-list">
            {events.data.map((event) => (
              <UI.ListItem key={event.request_id}>
                {
                  riders.data.find((r) => r.child_id === event.child_id)
                    ?.display_name
                }
                : {progressLabel(event.kind)} — reported by {event.actor_name}{" "}
                at{" "}
                <UI.Inline dateTime={event.occurred_at}>
                  {rideTime(event.occurred_at, timezone)}
                </UI.Inline>
                .
              </UI.ListItem>
            ))}
          </UI.List>
        ) : (
          <UI.Paragraph>
            No pickup, arrival or receipt reports yet.
          </UI.Paragraph>
        )}
      </Disclosure>
    </UI.Section>
  ),
);
