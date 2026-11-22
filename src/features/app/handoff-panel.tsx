import { View } from "react-native";
import * as UI from "@/ui/elements";
import { createPanel } from "@/ui/remote";
import { colors, spacing, styles } from "@/ui/styles";
import { createClient } from "@/lib/supabase/client";
import { progressLabel } from "@/lib/handoffs";
import { dateInZone, rideClock } from "@/lib/rides";
import { HandoffAllForm, HandoffForm, childRowId } from "./handoff-form";
import { Avatar, Disclosure, StatusBadge } from "./presentation";

const avatarTones = ["sky", "sun", "coral"];
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
// The driver's pickup buttons appear this long before the pickup time. The
// first pickup locks the ride, so it must not be possible days early.
const pickupWindow = 60 * 60_000;

function historyText(kind: string, actor: string, child: string) {
  switch (kind) {
    case "picked_up":
      return `${actor} picked up ${child}`;
    case "awaiting_handoff":
      return `${actor} arrived with ${child}`;
    case "completed":
      return `${actor} met ${child}`;
    default:
      return `${actor} updated ${child}’s trip`;
  }
}

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
  const [user, riders, handoffs, trip, events, driving] = await Promise.all([
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
    client.rpc("driver_status", { p_ride_id: rideId }),
  ]);
  if (
    riders.error ||
    handoffs.error ||
    trip.error ||
    events.error ||
    user.error ||
    driving.error
  )
    throw new Error("Pool couldn’t load this trip. Try again.");
  // Nothing to follow: no riders, or the ride was cancelled before it began.
  if (!riders.data.length || (cancelled && !trip.data)) return { early: null };
  const guardians = await client
    .from("family_members")
    .select("family_id,user_id")
    .in("family_id", [...new Set(riders.data.map((r) => r.family_id))])
    .is("removed_at", null);
  if (guardians.error)
    throw new Error("Pool couldn’t load this trip. Try again.");
  const profiles = await client
    .from("profiles")
    .select("id,display_name")
    .in("id", [...new Set(guardians.data.map((g) => g.user_id))]);
  if (profiles.error)
    throw new Error("Pool couldn’t load this trip. Try again.");
  const actor = user.data.user?.id;
  const status = driving.data[0];
  const covered = status?.coverage === "confirmed";
  const ownFamilies = new Set(
    guardians.data.filter((g) => g.user_id === actor).map((g) => g.family_id),
  );
  // Another family still has to say who meets their child: name that family.
  // The names are a courtesy, so the card still loads without them.
  const familyNames: Record<string, string> = {};
  if (
    riders.data.some(
      (r) =>
        !ownFamilies.has(r.family_id) &&
        !handoffs.data.some((h) => h.child_id === r.child_id),
    )
  ) {
    const ride = await client
      .from("rides")
      .select("circle_id")
      .eq("id", rideId)
      .maybeSingle();
    const roster = ride.data
      ? await client.rpc("circle_roster", { p_circle_id: ride.data.circle_id })
      : null;
    for (const family of roster?.data ?? [])
      familyNames[family.family_id] = family.family_name;
  }
  const now = Date.now();
  const opens = status ? Date.parse(status.starts_at) - pickupWindow : 0;
  // Keep each child's position stable while steps are saved, with the adult's
  // own family first. Moving a focused child after a step can lose focus.
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
      covered,
      driverName: covered
        ? firstName(status.current_driver_name || status.driver_name)
        : "",
      familyNames,
      // Pickup can be confirmed from an hour before the pickup time.
      open: covered && now >= opens,
      opensToday:
        covered &&
        dateInZone(new Date(now), timezone) ===
          dateInZone(new Date(opens), timezone)
          ? rideClock(new Date(opens).toISOString(), timezone)
          : "",
      orderedRiders,
    },
  };
}

type Guardian = { id: string; name: string };

// "the Brooks family", "the Chens": however the family named itself.
function familyLabel(name: string | undefined, child: string) {
  if (!name) return `${child}’s family`;
  const plain = name.trim().replace(/^the\s+/i, "");
  return /famil|s$/i.test(plain) ? `the ${plain}` : `the ${plain} family`;
}

// Someone other than the current choice meets the child. With one other
// guardian that is one tap; with more it is a short select.
function MeetChange({
  child,
  fields,
  others,
  actor,
}: {
  child: string;
  fields: Record<string, string>;
  others: Guardian[];
  actor?: string;
}) {
  if (!others.length) return null;
  if (others.length === 1)
    return (
      <HandoffForm
        command="designateRecipient"
        fields={{ ...fields, recipient_id: others[0].id }}
        label={
          others[0].id === actor
            ? `I’ll meet ${child}`
            : `${firstName(others[0].name)} will meet ${child}`
        }
        emphasis="quiet"
      />
    );
  return (
    <Disclosure title="Someone else">
      <HandoffForm
        command="designateRecipient"
        fields={fields}
        label="Save"
        emphasis="secondary"
      >
        <UI.Label>
          {`Who meets ${child}?`}
          <UI.Select name="recipient_id" defaultValue={others[0].id} required>
            {others.map((g) => (
              <UI.Option key={g.id} value={g.id}>
                {g.id === actor ? "Me" : g.name}
              </UI.Option>
            ))}
          </UI.Select>
        </UI.Label>
      </HandoffForm>
    </Disclosure>
  );
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
    covered,
    driverName,
    familyNames,
    open,
    opensToday,
    orderedRiders,
  }) => {
    const started = Boolean(trip.data);
    const completed = Boolean(trip.data?.completed_at);
    const rows = orderedRiders.map((rider) => {
      const h = handoffs.data.find((item) => item.child_id === rider.child_id);
      const family = guardians.data
        .filter((g) => g.family_id === rider.family_id)
        .map((g) => ({
          id: g.user_id,
          name:
            profiles.data.find((p) => p.id === g.user_id)?.display_name ??
            "Guardian",
        }));
      const own = family.some((g) => g.id === actor);
      return {
        rider,
        h,
        family,
        own,
        status: h?.status ?? "scheduled",
        // Someone is chosen to meet this child, and is still in the family.
        settled:
          Boolean(h) && (!own || family.some((g) => g.id === h?.recipient_id)),
        receives: Boolean(h) && h?.recipient_id === actor && own,
      };
    });
    // Pickup starts only when every child has someone to meet them.
    const ready = rows.every((row) => row.settled);
    const steps = rows.map((row) => {
      if (cancelled || completed) return null;
      if (row.receives && row.status === "awaiting_handoff") return "receive";
      if (isDriver && row.status === "picked_up") return "arrive";
      if (
        isDriver &&
        row.status === "scheduled" &&
        (started || (open && ready))
      )
        return "pickup";
      if (row.own && !started && !row.settled) return "choose";
      return null;
    });
    // Two or more children at the same step get one button for all of them.
    const together = (step: "pickup" | "arrive") =>
      rows
        .filter((_, index) => steps[index] === step)
        .map(({ rider, h }) => ({
          child_id: rider.child_id,
          version: h?.version ?? 0,
          name: rider.display_name,
        }));
    const pickups = together("pickup"),
      arrivals = together("arrive");
    const everyone =
      pickups.length > 1
        ? {
            command: "recordPickup" as const,
            label: "Picked up everyone",
            items: pickups,
          }
        : arrivals.length > 1 && !pickups.length
          ? {
              command: "reportArrival" as const,
              label: "Arrived with everyone",
              items: arrivals,
            }
          : null;
    // One primary button in the card: this person's first open step.
    const lead = everyone
      ? -1
      : steps.findIndex((step) => step && (step !== "choose" || covered));
    const note =
      cancelled || started
        ? null
        : !covered
          ? "The trip starts once a driver is confirmed."
          : !open
            ? isDriver && opensToday
              ? `You can confirm pickups from ${opensToday}.`
              : opensToday && driverName
                ? `${driverName} can confirm pickups from ${opensToday}.`
                : "Trip steps appear here on the day."
            : !ready
              ? isDriver
                ? "You can start once every child has someone to meet them."
                : null
              : isDriver
                ? "After the first pickup, the ride can’t be changed."
                : `After ${driverName ? `${driverName}’s` : "the"} first pickup, the ride can’t be changed.`;
    return (
      <UI.Section role="region" aria-labelledby="trip-progress">
        <UI.Heading2 id="trip-progress" style={{ marginBottom: spacing.xs }}>
          Trip
        </UI.Heading2>
        {completed && (
          <UI.Paragraph role="status" className="notice">
            Every child was handed off.
          </UI.Paragraph>
        )}
        {note && <UI.Small style={{ color: colors.muted }}>{note}</UI.Small>}
        {everyone && (
          <View style={{ marginTop: spacing.md }}>
            <HandoffAllForm
              key={everyone.command}
              command={everyone.command}
              rideId={rideId}
              revision={String(revision)}
              items={everyone.items}
              label={everyone.label}
            />
          </View>
        )}
        <UI.List style={{ marginBottom: 0 }}>
          {rows.map(
            ({ rider, h, family, own, status, settled, receives }, index) => {
              const name = rider.display_name;
              const step = steps[index];
              const emphasis = index === lead ? "primary" : "secondary";
              const fields = {
                ride_id: rideId,
                child_id: rider.child_id,
                revision: String(revision),
                version: String(h?.version ?? 0),
              };
              const before = status === "scheduled" || status === "picked_up";
              const meets =
                h && settled && before
                  ? h.recipient_id === actor
                    ? "You"
                    : h.recipient_name
                  : "";
              const times = [
                h?.picked_up_at &&
                  `Picked up ${rideClock(h.picked_up_at, timezone)}`,
                h?.arrived_at && `Arrived ${rideClock(h.arrived_at, timezone)}`,
                h?.completed_at &&
                  `Handed off ${rideClock(h.completed_at, timezone)}`,
              ]
                .filter(Boolean)
                .join(" · ");
              const waiting = cancelled
                ? null
                : !h
                  ? own
                    ? null
                    : `Waiting for ${familyLabel(familyNames[rider.family_id], name)} to say who meets ${name}`
                  : status === "awaiting_handoff" && !receives
                    ? `Waiting for ${h.recipient_name} to confirm the handoff`
                    : status === "picked_up" && !isDriver && driverName
                      ? `${name} is with ${driverName}`
                      : status === "scheduled" &&
                          started &&
                          !isDriver &&
                          driverName
                        ? `Waiting for ${driverName} to confirm pickup`
                        : null;
              const canChange = own && !started && !cancelled;
              return (
                <UI.ListItem
                  key={rider.child_id}
                  style={
                    index === rows.length - 1
                      ? { borderBottomWidth: 0 }
                      : undefined
                  }
                >
                  <UI.Article aria-label={name} style={{ gap: spacing.sm }}>
                    <View
                      style={[styles.row, { justifyContent: "space-between" }]}
                    >
                      <View style={[styles.row, { flex: 1 }]}>
                        <Avatar name={name} tone={avatarTones[index % 3]} />
                        <UI.Heading3
                          id={childRowId(rideId, rider.child_id)}
                          tabIndex={-1}
                          style={{ flex: 1, marginTop: 0, marginBottom: 0 }}
                        >
                          {name}
                        </UI.Heading3>
                      </View>
                      <View aria-live="polite">
                        <StatusBadge
                          tone={
                            status === "awaiting_handoff"
                              ? "attention"
                              : status === "scheduled"
                                ? "neutral"
                                : "positive"
                          }
                        >
                          {progressLabel(status)}
                        </StatusBadge>
                      </View>
                    </View>
                    {meets ? (
                      <View
                        style={[
                          styles.row,
                          { justifyContent: "space-between" },
                        ]}
                      >
                        <UI.Small style={{ color: colors.muted }}>
                          {`Who meets ${name}?`}
                        </UI.Small>
                        <UI.Small
                          style={{ fontWeight: "600", textAlign: "right" }}
                        >
                          {meets}
                        </UI.Small>
                      </View>
                    ) : null}
                    {times ? (
                      <UI.Small style={{ color: colors.muted }}>
                        {times}
                      </UI.Small>
                    ) : null}
                    {waiting && (
                      <UI.Small style={{ color: colors.muted }}>
                        {waiting}
                      </UI.Small>
                    )}
                    {step === "choose" && h && (
                      <UI.Paragraph className="notice attention">
                        {`${h.recipient_name} can’t meet ${name} anymore. Choose someone else.`}
                      </UI.Paragraph>
                    )}
                    {step === "choose" && (
                      <HandoffForm
                        key={`meet-${h?.version ?? 0}`}
                        command="designateRecipient"
                        fields={{ ...fields, recipient_id: actor ?? "" }}
                        label={`I’ll meet ${name}`}
                        emphasis={emphasis}
                      />
                    )}
                    {step === "pickup" && (
                      <HandoffForm
                        key={`pickup-${h?.version}`}
                        command="recordPickup"
                        fields={fields}
                        label={`Picked up ${name}`}
                        emphasis={emphasis}
                      />
                    )}
                    {step === "arrive" && (
                      <HandoffForm
                        key={`arrival-${h?.version}`}
                        command="reportArrival"
                        fields={fields}
                        label={`Arrived with ${name}`}
                        emphasis={emphasis}
                      />
                    )}
                    {step === "receive" && (
                      <HandoffForm
                        key={`receipt-${h?.version}`}
                        command="confirmHandoff"
                        fields={fields}
                        label={`I have ${name}`}
                        emphasis={emphasis}
                      />
                    )}
                    {canChange && (
                      <MeetChange
                        key={`change-${h?.version ?? 0}`}
                        child={name}
                        fields={fields}
                        actor={actor}
                        others={family.filter(
                          (g) => g.id !== (settled ? h?.recipient_id : actor),
                        )}
                      />
                    )}
                  </UI.Article>
                </UI.ListItem>
              );
            },
          )}
        </UI.List>
        <Disclosure title="History">
          {events.data.length ? (
            <UI.List className="activity-list">
              {events.data.map((event) => (
                <UI.ListItem key={event.request_id}>
                  <UI.Small>
                    <UI.Inline dateTime={event.occurred_at}>
                      {rideClock(event.occurred_at, timezone)}
                    </UI.Inline>
                    {" · "}
                    {historyText(
                      event.kind,
                      event.actor_name,
                      riders.data.find((r) => r.child_id === event.child_id)
                        ?.display_name ?? "a rider",
                    )}
                  </UI.Small>
                </UI.ListItem>
              ))}
            </UI.List>
          ) : (
            <UI.Small style={{ color: colors.muted }}>Nothing yet.</UI.Small>
          )}
        </Disclosure>
      </UI.Section>
    );
  },
);
