import { newRequestId } from "@/lib/request-id";
import * as UI from "@/ui/elements";
import { createPanel } from "@/ui/remote";
import { ActionDialog, Avatar, Disclosure, StatusBadge } from "./presentation";
import Link from "@/ui/link";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import type { DriverStatus } from "@/lib/drivers";
import { rideTime } from "@/lib/rides";
import { ChildChoices } from "./ride-form";
import { DriverForm, Confirmation, UTCDeadline } from "./driver-form";
type Option =
  Database["public"]["Functions"]["driver_options"]["Returns"][number];
async function loadReplacementPanel({
  status,
  familyId,
  revision,
  frozen,
  options,
  after,
}: {
  status: DriverStatus;
  familyId: string;
  revision: number;
  frozen: boolean;
  options: Option[];
  after?: string;
}) {
  if (
    after &&
    (!/^\d{1,16}$/.test(after) ||
      !Number.isSafeInteger(Number(after)) ||
      Number(after) < 1)
  )
    throw new Error("Invalid replacement history cursor");
  const client = await createClient();
  const [history, original] = await Promise.all([
    client
      .from("replacement_events")
      .select("*")
      .eq("ride_id", status.ride_id)
      .gt("id", Number(after ?? 0))
      .order("id")
      .limit(26),
    status.current_assignment_id
      ? client
          .from("driver_assignments")
          .select("driver_id")
          .eq("id", status.current_assignment_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (original.error)
    throw new Error("Original assignment could not be loaded");
  const candidates = options.filter(
    (v) =>
      status.coverage !== "confirmed" ||
      v.driver_id !== original.data?.driver_id,
  );
  if (history.error) throw new Error("Replacement history could not be loaded");
  const pending = status.proposal_status === "pending";
  const assigned = status.coverage === "confirmed";
  const canRequest =
    assigned || status.current_assignment_release_reason === "withdrawn";
  const originalConsents =
    assigned && status.current_proposal_id !== status.proposal_id && !frozen
      ? await client
          .from("ride_driver_consents")
          .select("child_id")
          .eq("proposal_id", status.current_proposal_id)
          .eq("family_id", familyId)
          .is("revoked_at", null)
      : { data: [], error: null };
  if (originalConsents.error)
    throw new Error("Current assignment consent could not be loaded");
  const originalRiders = originalConsents.data.length
    ? await client
        .from("ride_riders")
        .select("child_id,display_name")
        .eq("ride_id", status.ride_id)
        .in(
          "child_id",
          originalConsents.data.map((c) => c.child_id),
        )
    : { data: [], error: null };
  if (originalRiders.error)
    throw new Error("Current riders could not be loaded");
  const mode = assigned ? "optional_swap" : "unavailable";
  return {
    model: {
      status,
      familyId,
      revision,
      frozen,
      after,
      history,
      candidates,
      pending,
      assigned,
      canRequest,
      originalRiders,
      mode,
    },
  };
}

export const ReplacementPanel = createPanel(
  "loadReplacementPanel",
  loadReplacementPanel,
  ({
    status,
    familyId,
    revision,
    frozen,
    after,
    history,
    candidates,
    pending,
    assigned,
    canRequest,
    originalRiders,
    mode,
  }) => (
    <ActionDialog title="Review driver change" initialOpen={Boolean(after)}>
      <UI.Box id="replacement-review" className="candidate">
        <StatusBadge
          tone={
            status.cancelled_at || frozen
              ? "neutral"
              : assigned
                ? "positive"
                : "attention"
          }
        >
          {status.cancelled_at
            ? "Ride cancelled"
            : frozen
              ? "Trip plan frozen"
              : assigned
                ? status.proposal_status === "confirmed"
                  ? "Driver confirmed"
                  : "Original driver remains assigned"
                : "Uncovered until confirmed"}
        </StatusBadge>
        <UI.Box className="person-meta">
          <Avatar name={status.driver_name} tone="rose" />
          <UI.Box>
            <UI.Strong>{status.driver_name}</UI.Strong>
            <UI.Paragraph>
              {status.proposal_status === "confirmed"
                ? "Confirmed driver"
                : "Candidate · " + status.proposal_status}{" "}
              · {status.vehicle_label}
            </UI.Paragraph>
          </UI.Box>
        </UI.Box>
        <UI.Paragraph>
          {status.passenger_seats} registered passenger seats ·{" "}
          {status.rider_count} riders
        </UI.Paragraph>
        <UI.Paragraph>
          {status.accepted_at
            ? "Candidate accepted"
            : pending
              ? "Candidate reply needed"
              : "Candidate did not accept"}{" "}
          · Child consent: {status.consent_count} of {status.rider_count}
        </UI.Paragraph>
        {pending && (
          <UI.Paragraph>
            Reply by {rideTime(status.deadline, status.timezone)}
          </UI.Paragraph>
        )}
      </UI.Box>
      <UI.Paragraph>
        Share the ride with participants yourself. Each adult must open it and
        save their own reply.
      </UI.Paragraph>
      {frozen ? (
        <UI.Paragraph>
          Replacement is unavailable after any child’s pickup.
        </UI.Paragraph>
      ) : status.cancelled_at ? (
        <UI.Paragraph>
          This ride is cancelled. Previous replacement activity is available
          below.
        </UI.Paragraph>
      ) : pending ? (
        <UI.Paragraph role="status">
          Saved request pending. The current request must close before another
          can be nominated. Review the driver acceptance and child consent
          totals above; every enrolled child requires fresh consent.
        </UI.Paragraph>
      ) : !status.cancelled_at && status.current_assignment_id && canRequest ? (
        <>
          <UI.Paragraph>
            {assigned
              ? "Optional swap: the available current driver stays assigned until a replacement is fully confirmed. Decline, cancellation and expiry preserve that assignment."
              : "Unavailable driver: this ride is uncovered. Only a fresh request with the actual driver acceptance and consent for every child can restore coverage."}
          </UI.Paragraph>
          <DriverForm
            key={`replacement-${status.proposal_id}-${status.proposal_status}`}
            command="requestReplacement"
            fields={{
              proposal_id: newRequestId(),
              ride_id: status.ride_id,
              family_id: familyId,
              revision: String(revision),
              mode,
              original_assignment_id: status.current_assignment_id,
              original_assignment_revision: String(
                status.current_assignment_revision,
              ),
            }}
            label="Request replacement"
          >
            <UI.Label>
              Replacement driver and registered vehicle
              <UI.Select name="driver_vehicle" required defaultValue="">
                <UI.Option value="" disabled>
                  Choose a circle adult and vehicle
                </UI.Option>
                {candidates.map((v) => (
                  <UI.Option
                    key={`${v.driver_id}-${v.driver_family_id}-${v.vehicle_id}`}
                    value={[
                      v.driver_id,
                      v.driver_family_id,
                      v.vehicle_id,
                      v.vehicle_version,
                    ].join("|")}
                  >
                    {v.display_name} · {v.vehicle_label} · {v.passenger_seats}{" "}
                    passenger seats
                  </UI.Option>
                ))}
              </UI.Select>
            </UI.Label>
            <UTCDeadline
              value={new Date(status.starts_at).toISOString()}
              latest={new Date(status.starts_at).toISOString()}
            />
            <UI.Paragraph>
              Choose a future deadline no later than pickup:{" "}
              {rideTime(status.starts_at, status.timezone)}. This field uses
              UTC.
            </UI.Paragraph>
            <Confirmation>
              I request a replacement with fresh driver acceptance and consent
              for every enrolled child.
            </Confirmation>
          </DriverForm>
          {!candidates.length && (
            <UI.Paragraph>
              An eligible adult must{" "}
              <Link href="/app/vehicles">register a vehicle</Link> first.
            </UI.Paragraph>
          )}
        </>
      ) : (
        <UI.Paragraph>
          A replacement needs a current assignment or an assignment cleared by
          driver withdrawal. Nominate an initial driver when there is no
          previous driver assignment.
        </UI.Paragraph>
      )}
      {!!originalRiders.data.length && (
        <Disclosure title="Review original driver consent">
          <UI.Heading3>Consent for the current assignment</UI.Heading3>
          <UI.Paragraph>
            Your original consent for {status.current_driver_name} remains
            separate from this candidate request.
          </UI.Paragraph>
          <DriverForm
            command="revokeOwnConsent"
            fields={{
              proposal_id: status.current_proposal_id,
              revision: String(status.current_proposal_revision),
              family_id: familyId,
            }}
            label="Revoke original driver consent"
          >
            <ChildChoices>
              {originalRiders.data.map((r) => ({
                id: r.child_id,
                display_name: r.display_name,
              }))}
            </ChildChoices>
            <Confirmation>
              I revoke consent for the current driver and leave this ride
              needing a driver.
            </Confirmation>
          </DriverForm>
        </Disclosure>
      )}
      <UI.Heading3>Replacement activity</UI.Heading3>
      {history.data.length ? (
        <UI.List className="activity-list">
          {history.data.slice(0, 25).map((e) => (
            <UI.ListItem key={e.id}>
              {e.kind} — {e.actor_name} at{" "}
              <UI.Inline dateTime={e.occurred_at}>
                {rideTime(e.occurred_at, status.timezone)}
              </UI.Inline>
            </UI.ListItem>
          ))}
        </UI.List>
      ) : (
        <UI.Paragraph>No replacement requests on this page.</UI.Paragraph>
      )}
      {history.data.length > 25 && (
        <Link
          href={`/app/rides/${status.ride_id}?${new URLSearchParams({ family: familyId, after_replacement: String(history.data[24].id) })}`}
        >
          Next replacement activity
        </Link>
      )}
      {after && (
        <Link href={`/app/rides/${status.ride_id}?family=${familyId}`}>
          First replacement activity
        </Link>
      )}
    </ActionDialog>
  ),
);
