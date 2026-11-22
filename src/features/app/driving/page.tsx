import { View } from "react-native";
import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import { CommandForm } from "@/ui/command-form";
import Link from "@/ui/link";
import { colors, styles } from "@/ui/styles";
import { createClient } from "@/lib/supabase/client";
import {
  driverPageCursor,
  driverNextPage,
  type DriverStatus,
} from "@/lib/drivers";
import { rideSummary } from "@/lib/ride-state";
import { driverAction } from "@/services/driver-actions";
import type { CommandInput } from "@/services/fields";
import {
  ActionDialog,
  Disclosure,
  EmptyState,
  Icon,
  PageHeading,
} from "../presentation";
import { RideCard } from "../ride-list";
import { stepSpacing } from "../handoff-form";

const hour = 3_600_000;
// The inbox reads forward from a point in time. Starting from the very first
// ride id at that instant lets the first view open on what is coming up.
const firstId = "00000000-0000-0000-0000-000000000000";
// Every drive from the beginning, a page at a time.
const allDrives = `/app/driving?${new URLSearchParams({ after_start: new Date(0).toISOString(), after_id: firstId })}`;

function seatNeeds({
  booster_count: boosters,
  child_seat_count: seats,
}: Pick<DriverStatus, "booster_count" | "child_seat_count">) {
  return [
    boosters && `${boosters} ${boosters === 1 ? "booster" : "boosters"}`,
    seats && `${seats} ${seats === 1 ? "child seat" : "child seats"}`,
  ].filter(Boolean) as string[];
}

// A reply to "will you drive this ride?", answered where the request is shown.
// Saying yes offers the whole car, as "I’ll drive" does on Home.
export function DriveReply({
  status,
  primary = true,
}: {
  status: Pick<
    DriverStatus,
    | "proposal_id"
    | "ride_revision"
    | "passenger_seats"
    | "rider_count"
    | "vehicle_label"
    | "booster_count"
    | "child_seat_count"
  >;
  primary?: boolean;
}) {
  const needs = seatNeeds(status);
  const reply = {
    proposal_id: status.proposal_id,
    revision: String(status.ride_revision),
  };
  const accept = {
    ...reply,
    command: "acceptDriverProposal",
    available_seats: String(status.passenger_seats),
    confirm: "yes",
  };
  const send = (message: string) => async (values: CommandInput) => {
    const result = await driverAction({}, values);
    return result.error ? { error: result.error } : { message };
  };
  // Two buttons side by side. A form brings its own vertical margin, which the
  // card's action row already provides.
  const half = { flexGrow: 1, flexShrink: 1, flexBasis: 140 };
  const form = { ...half, ...stepSpacing };
  return (
    <View style={[styles.actionRow, { flex: 1 }]}>
      <View style={needs.length ? half : form}>
        {needs.length ? (
          <ActionDialog
            title="Yes, I’ll drive"
            tone={primary ? "primary" : "secondary"}
            triggerStyle={{ alignSelf: "stretch" }}
          >
            <UI.Paragraph style={{ marginTop: 0 }}>
              {`${status.rider_count === 1 ? "1 rider" : `${status.rider_count} riders`} in the ${status.vehicle_label}.`}
            </UI.Paragraph>
            <CommandForm
              action={send("You’re driving")}
              fields={accept}
              label="Yes, I’ll drive"
              after="close"
            >
              <UI.Label className="checkbox-label">
                <UI.Field
                  type="checkbox"
                  name="restraints"
                  value="yes"
                  required
                />
                {`I have ${needs.join(" and ")}`}
              </UI.Label>
            </CommandForm>
          </ActionDialog>
        ) : (
          <CommandForm
            action={send("You’re driving")}
            fields={{ ...accept, restraints: "yes" }}
            label="Yes, I’ll drive"
            secondary={!primary}
            after="toast"
          />
        )}
      </View>
      <View style={form}>
        <CommandForm
          action={send("Reply sent")}
          fields={{ ...reply, command: "declineDriverProposal" }}
          label="I can’t"
          tone="quiet"
          after="toast"
        />
      </View>
    </View>
  );
}

async function loadDriving({
  searchParams,
}: {
  searchParams: Promise<{
    after_start?: string;
    after_id?: string;
    pending?: string;
  }>;
}) {
  const client = await createClient();
  const query = await searchParams;
  const pendingOnly = query.pending === "1";
  let cursor: ReturnType<typeof driverPageCursor>;
  try {
    cursor = driverPageCursor(query);
  } catch {
    return {
      early: (
        <>
          <UI.Heading1>Driving</UI.Heading1>
          <UI.Paragraph role="alert">
            That link doesn’t work anymore. Go back to Driving to see your
            rides.
          </UI.Paragraph>
          <Link className="button secondary" href="/app/driving">
            Back to Driving
          </Link>
        </>
      ),
    };
  }
  // A link to a later page, or to requests only, reads one page from there.
  const paged = Boolean(query.after_id) || pendingOnly;
  const now = Date.now();
  const from = (hours: number) => ({
    p_after_start: new Date(now - hours * hour).toISOString(),
    p_after_id: firstId,
  });
  const pages = await Promise.all(
    paged
      ? [
          client.rpc("driver_inbox", {
            ...cursor,
            p_pending_only: pendingOnly,
            p_limit: 26,
          }),
        ]
      : [
          // Coming up, open requests, then the last 30 days for past drives.
          client.rpc("driver_inbox", { ...from(12), p_limit: 26 }),
          client.rpc("driver_inbox", { p_pending_only: true, p_limit: 26 }),
          client.rpc("driver_inbox", { ...from(24 * 30), p_limit: 100 }),
        ],
  );
  if (pages.some((page) => page.error))
    throw new Error("Pool couldn’t load your driving. Try again.");
  const page = pages[0].data ?? [];
  const more = page.length > 25 ? page[24] : undefined;
  const rows = [
    ...new Map(
      [page.slice(0, 25), ...pages.slice(1).map((p) => p.data ?? [])]
        .flat()
        .map((row) => [row.ride_id, row]),
    ).values(),
  ].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const ids = rows.map((row) => row.ride_id);
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
    throw new Error("Pool couldn’t load your driving. Try again.");
  const asked: Drive[] = [],
    driving: Drive[] = [],
    past: Drive[] = [];
  for (const status of rows) {
    const trip = trips.data.find((item) => item.ride_id === status.ride_id);
    const completed = Boolean(trip?.completed_at);
    const drive = {
      status,
      summary: rideSummary({
        cancelled: Boolean(status.cancelled_at),
        // After the last handoff the driver is no longer "current".
        status:
          completed && status.is_completed_driver
            ? { ...status, is_current_driver: true }
            : status,
        started: Boolean(trip),
        completed,
        awaitingReceipts: handoffs.data.filter(
          (item) =>
            item.ride_id === status.ride_id &&
            item.status === "awaiting_handoff",
        ).length,
      }),
    };
    const open =
      !status.cancelled_at &&
      status.proposal_status === "pending" &&
      status.is_driver;
    // A drive nobody tracked stops counting as upcoming half a day after it ended.
    const lapsed = !trip && Date.parse(status.ends_at) < now - 12 * hour;
    if (open && !status.accepted_at)
      asked.push({
        ...drive,
        summary: {
          ...drive.summary,
          detail: `You were asked to drive the ${status.vehicle_label}`,
        },
      });
    else if (
      !status.cancelled_at &&
      !completed &&
      !lapsed &&
      (status.is_current_driver || open)
    )
      driving.push(drive);
    else if (
      status.is_completed_driver ||
      status.is_current_driver ||
      (status.cancelled_at && status.is_driver)
    )
      past.unshift(drive);
  }
  return { model: { paged, pendingOnly, more, asked, driving, past } };
}
type Drive = { status: DriverStatus; summary: ReturnType<typeof rideSummary> };

function Drives({
  drives,
  reply = false,
}: {
  drives: Drive[];
  reply?: boolean;
}) {
  return (
    <UI.List className="ride-list">
      {drives.map(({ status, summary }, index) => (
        <RideCard
          key={status.ride_id}
          ride={{ ...status, id: status.ride_id, direction: "outbound" }}
          summary={summary}
        >
          {reply && (
            <DriveReply
              key={status.proposal_id}
              status={status}
              primary={index === 0}
            />
          )}
        </RideCard>
      ))}
    </UI.List>
  );
}

const Driving = createScreen(
  loadDriving,
  ({ paged, pendingOnly, more, asked, driving, past }) => (
    <>
      <PageHeading title="Driving" />
      {asked.length > 0 && (
        <UI.Box role="region" aria-label="Asked to drive">
          <UI.Heading2 style={{ marginBottom: 0 }}>Asked to drive</UI.Heading2>
          <Drives drives={asked} reply />
        </UI.Box>
      )}
      <UI.Box role="region" aria-label="You’re driving">
        <UI.Heading2 style={{ marginBottom: 0 }}>You’re driving</UI.Heading2>
        {driving.length ? (
          <Drives drives={driving} />
        ) : paged ? (
          <UI.Paragraph>No drives in this part of your list.</UI.Paragraph>
        ) : (
          <UI.Section>
            <EmptyState
              icon="car"
              title="You’re not driving any rides"
              href={asked.length ? undefined : "/app"}
              action="Find a ride"
            >
              Rides that still need a driver are on Home. Offer when you can
              take one.
            </EmptyState>
          </UI.Section>
        )}
      </UI.Box>
      {more && (
        <Link
          className="button secondary"
          href={driverNextPage(more, pendingOnly)}
        >
          Show more
        </Link>
      )}
      {(past.length > 0 || !paged) && (
        <Disclosure title="Past drives" open={paged}>
          {past.length ? (
            <Drives drives={past} />
          ) : (
            <UI.Small style={{ color: colors.muted }}>
              No drives in the last 30 days.
            </UI.Small>
          )}
          {!paged && (
            <Link className="text-link" href={allDrives}>
              Show earlier drives
              <Icon name="arrow-right" size={16} color={colors.blue} />
            </Link>
          )}
        </Disclosure>
      )}
      {paged ? (
        <Link className="text-link" href="/app/driving">
          Back to Driving
          <Icon name="arrow-right" size={16} color={colors.blue} />
        </Link>
      ) : (
        <Link className="text-link" href="/app/vehicles">
          Your cars
          <Icon name="arrow-right" size={16} color={colors.blue} />
        </Link>
      )}
    </>
  ),
);
export default Driving;
