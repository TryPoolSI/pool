import { View } from "react-native";
import * as UI from "@/ui/elements";
import { createPanel } from "@/ui/remote";
import { createClient } from "@/lib/supabase/client";
import Link from "@/ui/link";
import { colors, spacing, styles } from "@/ui/styles";
import { ActionDialog, Avatar, Disclosure, Icon } from "./presentation";
import { seatNeeds, type DriverStatus } from "@/lib/drivers";
import { DriverForm } from "./driver-form";
import { RideVehicleChange } from "./ride-vehicles";

export type AssignedVehicle = { id: string; label: string; driverId: string };

const plain = { marginVertical: 0 } as const;
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const riderCount = (count: number) =>
  count === 1 ? "1 rider" : `${count} riders`;

// The car of the driver who holds the ride while someone else is asked to take
// over. The request itself already names the car when there is no swap.
export async function loadAssignedVehicle(
  client: Awaited<ReturnType<typeof createClient>>,
  status: DriverStatus,
  known: { vehicle_id: string; vehicle_label: string }[] = [],
): Promise<AssignedVehicle | undefined> {
  if (
    status.coverage !== "confirmed" ||
    !status.current_assignment_id ||
    status.current_proposal_id === status.proposal_id
  )
    return undefined;
  const assignment = await client
    .from("driver_assignments")
    .select("driver_id,vehicle_id")
    .eq("id", status.current_assignment_id)
    .maybeSingle();
  if (assignment.error)
    throw new Error("Pool couldn’t load the driver for this ride. Try again.");
  if (!assignment.data) return undefined;
  const { driver_id: driverId, vehicle_id: id } = assignment.data;
  const option = known.find((item) => item.vehicle_id === id);
  if (option) return { id, label: option.vehicle_label, driverId };
  // Only the driver can read their own car; everyone else sees the name alone.
  const vehicle = await client
    .from("vehicles")
    .select("label")
    .eq("id", id)
    .maybeSingle();
  if (vehicle.error)
    throw new Error("Pool couldn’t load the driver for this ride. Try again.");
  return { id, label: vehicle.data?.label ?? "", driverId };
}

// The rare things a driver can do once the reply is in: switch cars, step back.
export function driverOptions(
  status: DriverStatus,
  {
    started,
    upcoming,
    assignedVehicle,
  }: { started: boolean; upcoming: boolean; assignedVehicle?: AssignedVehicle },
) {
  const live = status.proposal_status === "pending";
  const open = !started && !status.cancelled_at;
  const changeCar =
    open && upcoming && (live ? status.is_driver : status.is_current_driver)
      ? {
          proposalId: live ? status.proposal_id : status.current_proposal_id,
          revision: live
            ? status.ride_revision
            : status.current_proposal_revision,
          vehicleId: live
            ? status.vehicle_id
            : (assignedVehicle?.id ?? status.vehicle_id),
        }
      : null;
  const stepBack =
    open &&
    (status.is_current_driver ||
      (status.is_driver && live && Boolean(status.accepted_at)));
  // Someone else was asked to take over, so this driver's car stays as it is.
  const waitingOnSwap =
    open && live && status.is_current_driver && !status.is_driver;
  return { changeCar, stepBack, waitingOnSwap };
}

function Person({
  name,
  tone,
  title,
  detail,
}: {
  name: string;
  tone: "sky" | "sun";
  title: string;
  detail?: string;
}) {
  return (
    <View style={styles.row}>
      <Avatar name={name} tone={tone} />
      <View style={{ flex: 1 }}>
        <UI.Strong>{title}</UI.Strong>
        {detail ? (
          <UI.Small style={{ color: colors.muted }}>{detail}</UI.Small>
        ) : null}
      </View>
    </View>
  );
}

// Who is driving, in one glance: the driver and car, or who was asked, or that
// nobody is lined up yet. Anything the person can do about it goes in children.
export function DriverSummary({
  status,
  completed = false,
  assignedVehicle,
  children,
}: {
  status?: DriverStatus | null;
  completed?: boolean;
  assignedVehicle?: AssignedVehicle;
  children?: React.ReactNode;
}) {
  const live = status?.proposal_status === "pending";
  const covered = status?.coverage === "confirmed";
  if (!status || (!covered && !live && !completed)) {
    const asked = status ? firstName(status.driver_name) : "";
    // A driver who stepped back is the news until someone new has been asked.
    const steppedBack =
      status?.current_assignment_release_reason === "withdrawn" &&
      status.mode !== "unavailable";
    const before =
      !status || status.cancelled_at
        ? ""
        : steppedBack
          ? status.is_driver &&
            status.driver_name === status.current_driver_name
            ? "You stopped driving this ride. It needs a driver."
            : `${firstName(status.current_driver_name || status.driver_name)} can’t drive anymore. This ride needs a driver.`
          : status.is_driver
            ? ""
            : status.proposal_status === "declined"
              ? `${asked} can’t drive this one. This ride needs a driver.`
              : status.proposal_status === "expired"
                ? `${asked} didn’t reply in time. This ride needs a driver.`
                : status.proposal_status === "withdrawn"
                  ? `${asked} can’t drive anymore. This ride needs a driver.`
                  : status.proposal_status === "cancelled"
                    ? `The request to ${asked} was cancelled. This ride needs a driver.`
                    : "";
    return (
      <>
        <View style={styles.row}>
          <UI.Box className="team-icon">
            <Icon name="car" />
          </UI.Box>
          <View style={{ flex: 1 }}>
            <UI.Strong>No driver yet</UI.Strong>
            {before ? (
              <UI.Small style={{ color: colors.muted }}>{before}</UI.Small>
            ) : null}
          </View>
        </View>
        {children}
      </>
    );
  }
  const holder = status.current_driver_name || status.driver_name;
  const sameRequest = status.current_proposal_id === status.proposal_id;
  const holderIsMe = completed
    ? status.is_completed_driver || status.is_current_driver
    : status.is_current_driver;
  const holderCar = sameRequest
    ? status.vehicle_label
    : (assignedVehicle?.label ?? "");
  const asked = firstName(status.driver_name);
  const carChange =
    live &&
    covered &&
    (assignedVehicle?.driverId === status.driver_id ||
      (status.is_current_driver && status.is_driver));
  // The driver's yes is all a ride waits for.
  const progress =
    live && !covered && !status.accepted_at && !status.is_driver
      ? `The ride is set as soon as ${asked} says yes.`
      : "";
  const needs = seatNeeds(status);
  const driving = status.is_current_driver || (live && status.is_driver);
  return (
    <>
      {covered || completed ? (
        <Person
          name={holder}
          tone="sky"
          title={
            completed
              ? holderIsMe
                ? "You drove"
                : `${holder} drove`
              : holderIsMe
                ? "You’re driving"
                : `${holder} is driving`
          }
          detail={holderCar}
        />
      ) : (
        <Person
          name={status.driver_name}
          tone="sun"
          title={
            status.accepted_at
              ? status.is_driver
                ? "You can drive"
                : `${status.driver_name} can drive`
              : status.is_driver
                ? "You were asked to drive"
                : `${status.driver_name} was asked to drive`
          }
          detail={status.vehicle_label}
        />
      )}
      {covered && live && !completed && (
        <>
          {carChange ? (
            <UI.Paragraph style={plain}>
              {`${status.is_driver ? "You" : asked} asked to switch to the ${status.vehicle_label}. ${
                holderCar ? `The ${holderCar}` : "The current car"
              } stays until the switch is confirmed.`}
            </UI.Paragraph>
          ) : (
            <>
              <Person
                name={status.driver_name}
                tone="sun"
                title={
                  status.is_driver
                    ? "You were asked to take over"
                    : `${status.driver_name} was asked to take over`
                }
                detail={status.vehicle_label}
              />
              <UI.Paragraph style={plain}>
                {`${holderIsMe ? "You keep" : `${firstName(holder)} keeps`} driving until ${
                  status.is_driver ? "you say yes" : `${asked} says yes`
                }.`}
              </UI.Paragraph>
            </>
          )}
        </>
      )}
      {progress ? <UI.Paragraph style={plain}>{progress}</UI.Paragraph> : null}
      {driving && !completed && !status.cancelled_at && (
        <UI.Small style={{ color: colors.muted }}>
          {`${riderCount(status.rider_count)}${needs.length ? ` · bring ${needs.join(" and ")}` : ""}`}
        </UI.Small>
      )}
      {children}
    </>
  );
}

// The driver's answer to a request: yes or no. The whole car is offered, so
// nobody counts seats; boosters and child seats are confirmed only when needed.
// The driver's yes sets the ride; the families on it are told.
export function DriverReply({
  status,
  carChange = false,
}: {
  status: DriverStatus;
  carChange?: boolean;
}) {
  const needs = seatNeeds(status);
  const fields = {
    proposal_id: status.proposal_id,
    revision: String(status.ride_revision),
  };
  return (
    <View nativeID={`driver-reply-${status.ride_id}`}>
      <DriverForm
        command="acceptDriverProposal"
        fields={{
          ...fields,
          available_seats: String(status.passenger_seats),
          // With no boosters or child seats needed there is nothing to confirm.
          ...(needs.length ? {} : { restraints: "yes" }),
        }}
        label={carChange ? "Yes, use this car" : "Yes, I’ll drive"}
        after="toast"
      >
        {needs.length > 0 && (
          <UI.Label className="checkbox-label">
            <UI.Field type="checkbox" name="restraints" value="yes" required />
            {`I have ${needs.join(" and ")}`}
          </UI.Label>
        )}
      </DriverForm>
      <DriverForm
        command="declineDriverProposal"
        fields={fields}
        label={carChange ? "Keep my current car" : "I can’t"}
        tone="quiet"
        after="toast"
      />
    </View>
  );
}

// "You were asked to drive", with what the ride needs, in one sentence.
export function driverRequestLine(status: DriverStatus) {
  const needs = seatNeeds(status);
  return `${riderCount(status.rider_count)} in your ${status.vehicle_label}${
    needs.length ? `, with ${needs.join(" and ")}` : ""
  }.`;
}

// Rare driver actions, each in its own sheet so nothing here is one stray tap.
export function DriverMore({
  status,
  options,
  assignedVehicle,
}: {
  status: DriverStatus;
  options: ReturnType<typeof driverOptions>;
  assignedVehicle?: AssignedVehicle;
}) {
  const holder = firstName(status.current_driver_name || status.driver_name);
  return (
    <>
      {options.changeCar && (
        <ActionDialog title="Use a different car">
          <RideVehicleChange
            key={options.changeCar.proposalId}
            rideId={status.ride_id}
            proposalId={options.changeCar.proposalId}
            revision={options.changeCar.revision}
            riderCount={status.rider_count}
            proposedVehicleId={options.changeCar.vehicleId}
            assignedVehicleId={assignedVehicle?.id}
            needs={seatNeeds(status)}
            first={status.is_driver && !status.is_current_driver}
          />
        </ActionDialog>
      )}
      {options.waitingOnSwap && (
        <UI.Paragraph style={plain}>
          {`You can switch cars once ${firstName(status.driver_name)} has replied.`}
        </UI.Paragraph>
      )}
      {options.stepBack && (
        <ActionDialog
          title={
            status.is_current_driver
              ? "Stop driving this ride"
              : "Take back my offer"
          }
          tone="danger"
        >
          <UI.Paragraph style={{ marginTop: 0 }}>
            {status.is_current_driver
              ? "This ride will need a new driver. The families on it are told."
              : status.coverage === "confirmed"
                ? `${holder} keeps driving.`
                : "This ride will go back to needing a driver."}
          </UI.Paragraph>
          <DriverForm
            command="withdrawDriver"
            fields={
              status.is_current_driver
                ? {
                    proposal_id: status.current_proposal_id,
                    revision: String(status.current_proposal_revision),
                  }
                : {
                    proposal_id: status.proposal_id,
                    revision: String(status.ride_revision),
                  }
            }
            label={
              status.is_current_driver ? "Stop driving" : "Take back offer"
            }
            tone="danger"
          />
        </ActionDialog>
      )}
    </>
  );
}

async function loadDriverPanel({
  status,
  showLink = true,
  assignedVehicle: knownVehicle,
}: {
  status: DriverStatus;
  showLink?: boolean;
  assignedVehicle?: AssignedVehicle;
}) {
  const client = await createClient();
  const [trip, assignedVehicle] = await Promise.all([
    client
      .from("ride_trips")
      .select("completed_at")
      .eq("ride_id", status.ride_id)
      .maybeSingle(),
    knownVehicle || showLink
      ? knownVehicle
      : loadAssignedVehicle(client, status),
  ]);
  if (trip.error)
    throw new Error("Pool couldn’t load this ride’s driver. Try again.");
  const completed = Boolean(
    trip.data?.completed_at ||
    status.current_assignment_release_reason === "completed",
  );
  const options = driverOptions(status, {
    started: Boolean(trip.data),
    upcoming: Date.parse(status.starts_at) > Date.now(),
    assignedVehicle,
  });
  return { model: { status, showLink, completed, options, assignedVehicle } };
}

// One driver card for a ride. In a list (the Driving tab) it shows who drives,
// the reply buttons when this person was asked, and a link to the ride.
export const DriverPanel = createPanel(
  "loadDriverPanel",
  loadDriverPanel,
  ({ status, showLink, completed, options, assignedVehicle }) => {
    const asked =
      status.proposal_status === "pending" &&
      status.is_driver &&
      !status.accepted_at &&
      !status.cancelled_at &&
      !completed;
    const carChange = asked && status.is_current_driver;
    return (
      <UI.Section className="driver-panel">
        <View style={{ gap: spacing.md }}>
          {!showLink && (
            <UI.Heading2 style={{ marginBottom: 0 }}>Driver</UI.Heading2>
          )}
          {status.cancelled_at ? (
            <UI.Paragraph style={plain}>This ride was cancelled.</UI.Paragraph>
          ) : (
            <DriverSummary
              status={status}
              completed={completed}
              assignedVehicle={assignedVehicle}
            />
          )}
          {asked && <DriverReply status={status} carChange={carChange} />}
          {showLink ? (
            <Link className="text-link" href={`/app/rides/${status.ride_id}`}>
              Open ride
              <Icon name="arrow-right" size={16} color={colors.blue} />
            </Link>
          ) : (
            (options.changeCar || options.stepBack) && (
              <Disclosure title="More">
                <DriverMore
                  status={status}
                  options={options}
                  assignedVehicle={assignedVehicle}
                />
              </Disclosure>
            )
          )}
        </View>
      </UI.Section>
    );
  },
);
