import * as UI from "@/ui/elements";
import { createPanel } from "@/ui/remote";
import { createClient } from "@/lib/supabase/client";
import Link from "@/ui/link";
import { Avatar, Disclosure, StatusBadge } from "./presentation";
import { rideTime } from "@/lib/rides";
import { coverageLabel, type DriverStatus } from "@/lib/drivers";
import { DriverForm, Confirmation } from "./driver-form";

async function loadDriverPanel({
  status,
  showLink = true,
}: {
  status: DriverStatus;
  showLink?: boolean;
}) {
  const client = await createClient();
  const trip = await client
    .from("ride_trips")
    .select("completed_at")
    .eq("ride_id", status.ride_id)
    .maybeSingle();
  if (trip.error) throw new Error("Trip status could not be loaded");
  const completed = Boolean(
    trip.data?.completed_at ||
    status.current_assignment_release_reason === "completed",
  );
  const fields = {
    proposal_id: status.proposal_id,
    revision: String(status.ride_revision),
  };
  const live = status.proposal_status === "pending";
  const candidate =
    status.mode !== "initial" && status.proposal_status !== "confirmed";
  return {
    model: { status, showLink, trip, completed, fields, live, candidate },
  };
}

export const DriverPanel = createPanel(
  "loadDriverPanel",
  loadDriverPanel,
  ({ status, showLink, trip, completed, fields, live, candidate }) => (
    <UI.Section className="panel driver-panel">
      <UI.Heading2>Driver and assignment</UI.Heading2>
      <UI.Paragraph className="assignment-state">
        <StatusBadge
          tone={
            status.cancelled_at || completed
              ? "neutral"
              : status.coverage === "confirmed"
                ? "positive"
                : "attention"
          }
        >
          <UI.Strong>
            {status.cancelled_at
              ? "Cancelled ride"
              : completed
                ? "Ride completed"
                : coverageLabel(status.coverage)}
          </UI.Strong>
        </StatusBadge>
        {!completed && candidate && status.coverage === "confirmed" && (
          <UI.Inline>Current driver: {status.current_driver_name}</UI.Inline>
        )}
      </UI.Paragraph>
      {status.mode !== "initial" && (
        <>
          <UI.Heading3>
            {status.mode === "optional_swap"
              ? "Optional driver swap"
              : "Unavailable-driver replacement"}
          </UI.Heading3>
          <UI.Paragraph>
            {completed
              ? `Trip completed with ${status.current_driver_name}. This replacement request is ${status.proposal_status}.`
              : status.coverage === "confirmed" &&
                  status.proposal_status !== "confirmed"
                ? `The original driver remains assigned. Replacement proposal ${status.proposal_status}.`
                : status.coverage !== "confirmed"
                  ? "There is no confirmed driver. This ride stays uncovered until the driver accepts and every child has consent."
                  : "Replacement confirmed."}
          </UI.Paragraph>
        </>
      )}
      {!status.cancelled_at &&
        !completed &&
        status.mode === "initial" &&
        status.coverage !== "confirmed" && (
          <UI.Paragraph>
            There is no confirmed driver. Acceptance and every child’s consent
            are required.
          </UI.Paragraph>
        )}
      <UI.Box className="driver-summary">
        <Avatar name={status.driver_name} tone={candidate ? "rose" : "green"} />
        <UI.Box>
          <UI.Inline className="eyebrow">
            {status.cancelled_at
              ? "Previous proposal"
              : completed && status.current_proposal_id === status.proposal_id
                ? "Trip driver"
                : candidate
                  ? "Replacement candidate · " + status.proposal_status
                  : status.proposal_status === "confirmed"
                    ? "Confirmed driver"
                    : "Driver proposal · " + status.proposal_status}
          </UI.Inline>
          <UI.Strong>
            {status.driver_name} · {status.vehicle_label}
          </UI.Strong>
          <UI.Break />
          {status.passenger_seats} registered passenger seats
        </UI.Box>
      </UI.Box>
      <UI.Paragraph>
        Driver acceptance:{" "}
        {status.accepted_at ? "Accepted" : live ? "Required" : "Not accepted"} ·
        Child consents: {status.consent_count} of {status.rider_count}
      </UI.Paragraph>
      <UI.Paragraph className="driver-facts">
        <UI.Inline>{status.rider_count} riders</UI.Inline>
        <UI.Inline>
          {status.booster_count} booster · {status.child_seat_count} child seats
        </UI.Inline>
        {status.accepted_at && (
          <UI.Inline>
            {status.available_seats} offered passenger seats
          </UI.Inline>
        )}
      </UI.Paragraph>
      {live && (
        <UI.Paragraph>
          Reply by {rideTime(status.deadline, status.timezone)}
        </UI.Paragraph>
      )}
      {(!live || !status.is_driver) && (
        <Disclosure title="Capacity and proposal details">
          <UI.Paragraph>
            Proposal {status.proposal_status} · Vehicle version{" "}
            {status.vehicle_version} · Ride revision {status.ride_revision}
          </UI.Paragraph>
          <UI.Paragraph>
            {status.rider_count} riders · {status.booster_count} booster seats ·{" "}
            {status.child_seat_count} child seats
          </UI.Paragraph>
          {status.accepted_at && (
            <UI.Paragraph>
              Driver attested: {status.available_seats} available passenger
              seats and all required restraints.
            </UI.Paragraph>
          )}
          <UI.Paragraph>
            Proposal deadline: {rideTime(status.deadline, status.timezone)}
          </UI.Paragraph>
        </Disclosure>
      )}
      {status.cancelled_at && (
        <UI.Paragraph>This ride was cancelled for everyone.</UI.Paragraph>
      )}
      {status.is_driver && live && (
        <UI.Box id={`driver-reply-${status.ride_id}`}>
          <Disclosure title="Your driver reply" open={!status.accepted_at}>
            <UI.Paragraph>
              {status.rider_count} riders · {status.booster_count} booster seats
              · {status.child_seat_count} child seats
            </UI.Paragraph>
            <UI.Paragraph>
              Vehicle version {status.vehicle_version} · Ride revision{" "}
              {status.ride_revision}. Acceptance is separate from consent for
              your own children.
            </UI.Paragraph>
            {status.accepted_at && (
              <UI.Paragraph>
                You reported {status.available_seats} available passenger seats
                and all required restraints.
              </UI.Paragraph>
            )}
            <DriverForm
              command="acceptDriverProposal"
              fields={fields}
              label={
                status.accepted_at
                  ? "Retry driver acceptance"
                  : "Accept as driver"
              }
            >
              <UI.Label>
                Available passenger seats, excluding you
                <UI.Field
                  name="available_seats"
                  type="number"
                  min={status.rider_count}
                  max={status.passenger_seats}
                  step={1}
                  defaultValue={
                    status.available_seats ?? status.passenger_seats
                  }
                  required
                />
              </UI.Label>
              <UI.Label className="checkbox-label">
                <UI.Field
                  name="restraints"
                  type="checkbox"
                  value="yes"
                  required
                />
                I can accommodate all {status.booster_count} booster seats and{" "}
                {status.child_seat_count} child seats required for these riders.
              </UI.Label>
              <Confirmation>
                I explicitly accept driving this ride with this vehicle and
                available passenger capacity.
              </Confirmation>
            </DriverForm>
            <DriverForm
              command="declineDriverProposal"
              fields={fields}
              label="Decline driving"
            />
          </Disclosure>
        </UI.Box>
      )}
      {!trip.data &&
        (status.is_current_driver ||
          (status.is_driver && live && status.accepted_at)) && (
          <Disclosure
            title={
              status.is_current_driver
                ? "Withdraw as driver"
                : "Withdraw proposed driving"
            }
          >
            <DriverForm
              command="withdrawDriver"
              fields={
                status.is_current_driver
                  ? {
                      proposal_id: status.current_proposal_id,
                      revision: String(status.current_proposal_revision),
                    }
                  : fields
              }
              label={
                status.is_current_driver
                  ? "Withdraw as driver"
                  : "Withdraw proposed driving"
              }
            >
              <Confirmation>
                {status.is_current_driver || status.mode === "initial"
                  ? "I withdraw and leave this ride needing a driver."
                  : "I withdraw this candidate response. An available original driver stays assigned."}
              </Confirmation>
            </DriverForm>
          </Disclosure>
        )}
      {showLink && (
        <Link className="text-link" href={`/app/rides/${status.ride_id}`}>
          Open ride details <UI.Inline aria-hidden="true">›</UI.Inline>
        </Link>
      )}
    </UI.Section>
  ),
);
