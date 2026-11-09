import { newRequestId } from "@/lib/request-id";
import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import Link from "@/ui/link";
import {
  PageHeading,
  StatusBadge,
  RouteSummary,
  Disclosure,
} from "../../presentation";
import { notFound } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/client";
import { rideTime } from "@/lib/rides";
import { RideForm, ChildChoices } from "../../ride-form";
import { DriverForm, Confirmation } from "../../driver-form";
import { HandoffPanel } from "../../handoff-panel";
import { DriverPanel } from "../../driver-panel";
import { ReplacementPanel } from "../../replacement-panel";
import { coverageLabel } from "@/lib/drivers";
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
  if (offers.error) throw new Error("Ride could not be loaded");
  const offer =
    offers.data.find((item) => item.family_id === query.family) ??
    (!query.family ? offers.data[0] : undefined);
  const driving = await client.rpc("driver_status", { p_ride_id: id });
  if (driving.error) throw new Error("Driver status could not be loaded");
  const status = driving.data[0];
  const trip = await client
    .from("ride_trips")
    .select("completed_at")
    .eq("ride_id", id)
    .maybeSingle();
  if (trip.error) throw new Error("Trip could not be loaded");
  const frozen = Boolean(trip.data);
  if (
    !offer &&
    (status?.is_driver ||
      status?.is_current_driver ||
      status?.is_completed_driver)
  ) {
    const [exact, enrolled] = await Promise.all([
      client
        .from("ride_locations")
        .select("pickup,destination")
        .eq("ride_id", id)
        .maybeSingle(),
      client
        .from("ride_riders")
        .select("child_id,display_name,seat_requirement")
        .eq("ride_id", id),
    ]);
    if (exact.error || enrolled.error)
      throw new Error("Assignment could not be loaded");
    const progress = exact.data && (
      <HandoffPanel
        rideId={id}
        revision={status.ride_revision}
        timezone={status.timezone}
        isDriver={status.is_current_driver}
        cancelled={Boolean(status.cancelled_at)}
      />
    );
    return {
      early: (
        <>
          <PageHeading
            eyebrow="Your driving"
            title={`${status.pickup_summary} → ${status.destination_summary}`}
          />
          <UI.Box className="ride-time">
            <UI.Paragraph>
              Pickup: {rideTime(status.starts_at, status.timezone)}
            </UI.Paragraph>
            <UI.Paragraph>
              Drop-off: {rideTime(status.ends_at, status.timezone)}
            </UI.Paragraph>
          </UI.Box>
          {(status.coverage === "confirmed" || trip.data?.completed_at) && (
            <UI.Paragraph className="ride-current-driver">
              {trip.data?.completed_at ? "Trip driver" : "Current driver"} ·{" "}
              {status.current_driver_name || status.driver_name}
            </UI.Paragraph>
          )}
          <UI.Box className="ride-overview">
            <UI.Section className="panel">
              <UI.Heading2>Pickup and destination</UI.Heading2>
              {exact.data ? (
                <RouteSummary
                  pickup={exact.data.pickup}
                  destination={exact.data.destination}
                />
              ) : (
                <UI.Paragraph>
                  Only the minimal driver proposal is available. Exact private
                  locations become available after confirmation.
                </UI.Paragraph>
              )}
            </UI.Section>
            <DriverPanel status={status} showLink={false} />
          </UI.Box>
          {progress}
          {exact.data && (
            <Disclosure title="Enrolled riders">
              <UI.List>
                {enrolled.data.map((c) => (
                  <UI.ListItem key={c.child_id}>
                    {c.display_name} · {c.seat_requirement}
                  </UI.ListItem>
                ))}
              </UI.List>
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
            This ride is unavailable to this account or your family is no longer
            in its circle.
          </UI.Paragraph>
        </>
      ),
    };
  const [
    families,
    children,
    locations,
    riders,
    participation,
    roster,
    options,
    consents,
  ] = await Promise.all([
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
      .eq("ride_id", id),
    client.from("ride_families").select("family_id,status").eq("ride_id", id),
    client.rpc("circle_roster", { p_circle_id: offer.circle_id }),
    client.rpc("driver_options", { p_ride_id: id }),
    client
      .from("ride_driver_consents")
      .select("child_id,revoked_at")
      .eq("ride_id", id)
      .eq("family_id", offer.family_id)
      .eq(
        "proposal_id",
        status?.proposal_id ?? "00000000-0000-0000-0000-000000000000",
      ),
  ]);
  if (
    families.error ||
    children.error ||
    locations.error ||
    riders.error ||
    participation.error ||
    roster.error ||
    options.error ||
    consents.error
  )
    throw new Error("Ride details could not be loaded");
  const locked =
    frozen ||
    status?.coverage === "confirmed" ||
    status?.coverage === "awaiting_confirmation";
  const fields = {
    ride_id: id,
    family_id: offer.family_id,
    revision: String(offer.revision),
  };
  const familyName = (familyId: string) =>
    families.data.find((f) => f.id === familyId)?.name ??
    roster.data.find((f) => f.family_id === familyId)?.family_name ??
    "Invited circle family";
  const visibleCoverage =
    !status && offer.status !== "joined"
      ? "Join with your family to view driver status"
      : coverageLabel(status?.coverage);
  const currentDriver =
    status?.coverage === "confirmed" || trip.data?.completed_at
      ? status?.current_driver_name || status?.driver_name
      : null;
  const driverPanel = status && (
    <DriverPanel status={status} showLink={false} />
  );
  const handoffs = locations.data && (
    <HandoffPanel
      rideId={id}
      revision={offer.revision}
      timezone={offer.timezone}
      isDriver={Boolean(status?.is_current_driver)}
      cancelled={Boolean(offer.cancelled_at)}
    />
  );
  const ownRiders = riders.data.filter((r) => r.family_id === offer.family_id);
  const needsConsent = ownRiders.some(
    (r) =>
      !consents.data.some((c) => c.child_id === r.child_id && !c.revoked_at),
  );
  return {
    model: {
      id,
      query,
      offers,
      offer,
      status,
      trip,
      frozen,
      children,
      locations,
      riders,
      participation,
      options,
      consents,
      locked,
      fields,
      familyName,
      visibleCoverage,
      currentDriver,
      driverPanel,
      handoffs,
      ownRiders,
      needsConsent,
    },
  };
}

const RideDetail = createScreen(
  loadRideDetail,
  ({
    id,
    query,
    offers,
    offer,
    status,
    trip,
    frozen,
    children,
    locations,
    riders,
    participation,
    options,
    consents,
    locked,
    fields,
    familyName,
    visibleCoverage,
    currentDriver,
    driverPanel,
    handoffs,
    ownRiders,
    needsConsent,
  }) => (
    <>
      <PageHeading
        eyebrow={offer.direction === "return" ? "Return ride" : "Outbound ride"}
        title={`${offer.pickup_summary} → ${offer.destination_summary}`}
      />
      <UI.Box className="ride-time">
        <UI.Paragraph>
          Pickup:{" "}
          <UI.Inline dateTime={offer.starts_at}>
            {rideTime(offer.starts_at, offer.timezone)}
          </UI.Inline>
        </UI.Paragraph>
        <UI.Paragraph>
          Drop-off:{" "}
          <UI.Inline dateTime={offer.ends_at}>
            {rideTime(offer.ends_at, offer.timezone)}
          </UI.Inline>
        </UI.Paragraph>
      </UI.Box>
      {frozen && (
        <UI.Anchor
          className="button primary ride-next-action"
          href="#trip-progress"
        >
          {trip.data?.completed_at
            ? "Review completed handoffs"
            : "Review pickup and handoffs"}{" "}
          →
        </UI.Anchor>
      )}
      {!status && !offer.cancelled_at && (
        <StatusBadge tone={offer.status === "joined" ? "attention" : "neutral"}>
          {offer.status === "joined"
            ? "Needs a driver"
            : "Private ride summary"}
        </StatusBadge>
      )}
      {currentDriver && !offer.cancelled_at && (
        <UI.Paragraph className="ride-current-driver">
          <UI.Inline>
            {trip.data?.completed_at ? "Trip driver" : "Current driver"}
          </UI.Inline>{" "}
          · {currentDriver}
          {status?.proposal_status === "pending" &&
            status.mode !== "initial" &&
            " · Replacement under review"}
        </UI.Paragraph>
      )}
      {!offer.cancelled_at &&
        !frozen &&
        status?.proposal_status === "pending" &&
        (status.is_driver && !status.accepted_at ? (
          <UI.Anchor
            className="button primary ride-next-action"
            href={`#driver-reply-${status.ride_id}`}
          >
            Review driving request
          </UI.Anchor>
        ) : needsConsent && offer.status === "joined" ? (
          <UI.Anchor
            className="button primary ride-next-action"
            href="#family-consent"
          >
            Review driver for your children
          </UI.Anchor>
        ) : null)}
      {!status && <UI.Paragraph>{visibleCoverage}</UI.Paragraph>}
      {offers.data.length > 1 && (
        <UI.Nav aria-label="Your family contexts">
          {offers.data.map((item) => (
            <Link
              key={item.family_id}
              aria-current={
                item.family_id === offer.family_id ? "page" : undefined
              }
              href={`/app/rides/${id}?family=${item.family_id}`}
            >
              {familyName(item.family_id)}
            </Link>
          ))}
        </UI.Nav>
      )}
      {offer.cancelled_at && (
        <UI.Paragraph role="status" className="notice neutral">
          Cancelled for all families. This ride cannot be reopened.
        </UI.Paragraph>
      )}
      <UI.Box className="ride-overview">
        <UI.Section className="panel route-panel">
          <UI.Paragraph className="eyebrow">THE RIDE PLAN</UI.Paragraph>
          <UI.Heading2>Pickup and destination</UI.Heading2>
          {locations.data ? (
            <RouteSummary
              pickup={locations.data.pickup}
              destination={locations.data.destination}
            />
          ) : (
            <RouteSummary
              pickup={offer.pickup_summary}
              destination={offer.destination_summary}
            />
          )}
          <UI.Paragraph>
            Pickup: {rideTime(offer.starts_at, offer.timezone)}
            <UI.Break />
            Drop-off: {rideTime(offer.ends_at, offer.timezone)}
          </UI.Paragraph>
          <UI.Paragraph className="section-caption">
            {frozen
              ? "Plan and responsibilities frozen after first pickup."
              : "The driver and each family reply separately."}
          </UI.Paragraph>
        </UI.Section>
        {driverPanel || (
          <UI.Section className="panel">
            <UI.Heading2>
              {offer.cancelled_at
                ? "Ride cancelled"
                : offer.status === "joined"
                  ? "A driver is needed"
                  : "Your family’s invitation"}
            </UI.Heading2>
            <UI.Paragraph>
              {offer.cancelled_at
                ? "This ride is closed for every family. Its saved route and responses remain available below."
                : offer.status === "joined"
                  ? "Nominate an available adult and vehicle. Coverage requires their acceptance and consent for every enrolled child."
                  : "Your family chooses its own riders. Exact locations and driver details are private until you join."}
            </UI.Paragraph>
          </UI.Section>
        )}
      </UI.Box>
      {!locations.data && (
        <UI.Paragraph>
          Only the minimal invitation summary is available. Join with your own
          child to view exact locations and riders.
        </UI.Paragraph>
      )}
      {!offer.cancelled_at && offer.status === "joined" && (
        <>
          {!locked &&
            status?.current_assignment_release_reason !== "withdrawn" && (
              <UI.Section>
                <UI.Heading2>Choose a driver</UI.Heading2>
                <UI.Paragraph>
                  Each invited family must respond before nomination. The driver
                  and families then reply separately.
                </UI.Paragraph>
                {options.data.length ? (
                  <DriverForm
                    key={`nominate-${offer.revision}`}
                    command="proposeDriver"
                    fields={{ ...fields, proposal_id: newRequestId() }}
                    label="Nominate driver"
                  >
                    <UI.Label>
                      Driver and registered vehicle
                      <UI.Select name="driver_vehicle" required defaultValue="">
                        <UI.Option value="" disabled>
                          Choose a circle adult and vehicle
                        </UI.Option>
                        {options.data.map((v) => (
                          <UI.Option
                            key={`${v.driver_id}-${v.driver_family_id}-${v.vehicle_id}`}
                            value={[
                              v.driver_id,
                              v.driver_family_id,
                              v.vehicle_id,
                              v.vehicle_version,
                            ].join("|")}
                          >
                            {v.display_name} · {v.vehicle_label} ·{" "}
                            {v.passenger_seats} passenger seats
                          </UI.Option>
                        ))}
                      </UI.Select>
                    </UI.Label>
                    <Confirmation>
                      I nominate this adult and vehicle for this ride’s current
                      riders and plan.
                    </Confirmation>
                  </DriverForm>
                ) : (
                  <UI.Paragraph>
                    No registered vehicles available. An adult must{" "}
                    <Link href="/app/vehicles">register their own vehicle</Link>{" "}
                    first.
                  </UI.Paragraph>
                )}
              </UI.Section>
            )}
          {status &&
            (status.proposal_status === "pending" ||
              status.proposal_status === "confirmed") &&
            locked &&
            !frozen && (
              <UI.Section id="family-consent">
                <UI.Heading2>
                  {needsConsent
                    ? "Your children’s consent"
                    : "Your family’s consent"}
                </UI.Heading2>
                <UI.Paragraph>
                  {status.driver_name} · {status.vehicle_label}
                </UI.Paragraph>
                <UI.List>
                  {ownRiders.map((r) => (
                    <UI.ListItem key={r.child_id}>
                      {r.display_name}:{" "}
                      {consents.data.some(
                        (c) => c.child_id === r.child_id && !c.revoked_at,
                      )
                        ? "Consent saved"
                        : "Consent required"}
                    </UI.ListItem>
                  ))}
                </UI.List>
                {status.proposal_status === "pending" && (
                  <Disclosure
                    title={
                      needsConsent ? "Approve driver" : "Review saved consent"
                    }
                    open={needsConsent}
                  >
                    <UI.Paragraph>
                      Vehicle version {status.vehicle_version} · Ride revision{" "}
                      {status.ride_revision}. Your reply covers only your
                      selected children.
                    </UI.Paragraph>
                    <DriverForm
                      key={`consent-${status.proposal_id}`}
                      command="consentForOwnChildren"
                      fields={{
                        proposal_id: status.proposal_id,
                        revision: String(status.ride_revision),
                        family_id: offer.family_id,
                      }}
                      label="Approve driver for selected children"
                    >
                      <ChildChoices>
                        {ownRiders.map((r) => ({
                          id: r.child_id,
                          display_name: r.display_name,
                        }))}
                      </ChildChoices>
                      <Confirmation>
                        I explicitly consent to this driver, vehicle and plan
                        for my selected children.
                      </Confirmation>
                    </DriverForm>
                  </Disclosure>
                )}
                {consents.data.some((c) => !c.revoked_at) && (
                  <Disclosure title="Revoke consent">
                    <DriverForm
                      command="revokeOwnConsent"
                      fields={{
                        proposal_id: status.proposal_id,
                        revision: String(status.ride_revision),
                        family_id: offer.family_id,
                      }}
                      label="Revoke selected child consent"
                    >
                      <ChildChoices>
                        {ownRiders
                          .filter((r) =>
                            consents.data.some(
                              (c) => c.child_id === r.child_id && !c.revoked_at,
                            ),
                          )
                          .map((r) => ({
                            id: r.child_id,
                            display_name: r.display_name,
                          }))}
                      </ChildChoices>
                      <Confirmation>
                        I revoke consent and{" "}
                        {status.mode !== "initial" &&
                        status.proposal_status === "pending"
                          ? "close this replacement request. An available original driver stays assigned."
                          : "leave this ride needing a driver."}
                      </Confirmation>
                    </DriverForm>
                  </Disclosure>
                )}
                {status.proposal_status === "pending" && (
                  <Disclosure title="Cancel driver proposal">
                    <DriverForm
                      command="cancelDriverProposal"
                      fields={{
                        proposal_id: status.proposal_id,
                        revision: String(status.ride_revision),
                        family_id: offer.family_id,
                      }}
                      label="Cancel driver proposal"
                    >
                      <Confirmation>
                        I cancel this nomination
                        {status.mode !== "initial"
                          ? ". An available original driver stays assigned."
                          : " and release the roster for changes."}
                      </Confirmation>
                    </DriverForm>
                  </Disclosure>
                )}
              </UI.Section>
            )}
        </>
      )}
      {handoffs}
      {locations.data && (
        <UI.Section className="roster-panel">
          <UI.Heading2>Enrolled riders</UI.Heading2>
          {riders.data.length ? (
            <UI.List>
              {riders.data.map((rider) => (
                <UI.ListItem key={rider.child_id}>
                  {rider.display_name} · {rider.seat_requirement} ·{" "}
                  {familyName(rider.family_id)}
                </UI.ListItem>
              ))}
            </UI.List>
          ) : (
            <UI.Paragraph>No riders currently enrolled.</UI.Paragraph>
          )}
          <UI.Heading2>Family responses</UI.Heading2>
          <UI.List>
            {participation.data.map((item) => (
              <UI.ListItem key={item.family_id}>
                {familyName(item.family_id)} · {item.status}
              </UI.ListItem>
            ))}
          </UI.List>
        </UI.Section>
      )}
      {status && offer.status === "joined" && (
        <ReplacementPanel
          status={status}
          familyId={offer.family_id}
          revision={offer.revision}
          frozen={frozen}
          options={options.data}
          after={query.after_replacement}
        />
      )}
      {!offer.cancelled_at && (
        <>
          {!locked && (
            <Disclosure
              title={
                offer.status === "joined"
                  ? "Change your family’s riders"
                  : "Respond for your family"
              }
              open={offer.status !== "joined"}
            >
              <Link
                className="text-link"
                href={`/app/children?family=${offer.family_id}`}
              >
                Manage your children
              </Link>
              {offer.status === "joined" ? (
                <RideForm
                  key={`${offer.family_id}-${offer.revision}`}
                  command="setOwnRideRiders"
                  fields={fields}
                  label="Save own riders"
                >
                  <ChildChoices
                    selected={ownRiders.map((item) => item.child_id)}
                  >
                    {children.data}
                  </ChildChoices>
                  <UI.Paragraph>
                    Uncheck all children to withdraw your family and remove
                    access to exact locations.
                  </UI.Paragraph>
                </RideForm>
              ) : (
                <>
                  {!!children.data.length && (
                    <RideForm
                      key={`${offer.family_id}-${offer.revision}`}
                      command="respondToRideInvitation"
                      fields={{ ...fields, response: "join" }}
                      label="Join with own riders"
                    >
                      <ChildChoices>{children.data}</ChildChoices>
                      <UI.Paragraph>Select at least one child.</UI.Paragraph>
                    </RideForm>
                  )}
                  <RideForm
                    command="respondToRideInvitation"
                    fields={{ ...fields, response: "decline" }}
                    label="Decline ride"
                  />
                </>
              )}
            </Disclosure>
          )}
          {offer.can_cancel && !frozen && (
            <Disclosure title="Cancel ride">
              <RideForm
                command="cancelRide"
                fields={fields}
                label="Cancel ride"
              >
                <UI.Label className="checkbox-label">
                  <UI.Field
                    type="checkbox"
                    name="confirm"
                    value="yes"
                    required
                  />
                  I confirm cancellation for every family.
                </UI.Label>
              </RideForm>
            </Disclosure>
          )}
        </>
      )}
      <Disclosure title="Plan details">
        <UI.Paragraph>
          {familyName(offer.family_id)} · {offer.status} · Revision{" "}
          {offer.revision} · {offer.timezone}
        </UI.Paragraph>
        {locked && (
          <UI.Paragraph>
            {frozen
              ? "The plan and responsibilities are frozen after first pickup."
              : "Cancel the proposal, withdraw as driver or revoke consent before changing riders. Changes require fresh consent."}
          </UI.Paragraph>
        )}
      </Disclosure>
      <Link className="text-link" href="/app/schedule">
        Weekly schedule <UI.Inline aria-hidden="true">›</UI.Inline>
      </Link>
    </>
  ),
);
export default RideDetail;
