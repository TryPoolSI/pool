import * as UI from "@/ui/elements";
import { createPanel } from "@/ui/remote";
import { ActionDialog, Disclosure } from "./presentation";
import Link from "@/ui/link";
import { createClient } from "@/lib/supabase/client";
import type { DriverStatus } from "@/lib/drivers";
import { rideTimeShort } from "@/lib/rides";
import { AskDriverForm, type DriverOption } from "./ride-vehicles";

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

// What happened, in the words a parent would use.
function changeText(kind: string, actor: string) {
  switch (kind) {
    case "requested":
      return `${actor} asked for a different driver or car`;
    case "accepted":
      return `${actor} said yes`;
    case "consented":
      return `${actor} approved`;
    case "confirmed":
      return "The change went through";
    case "declined":
      return `${actor} said no`;
    case "cancelled":
      return `${actor} cancelled the request`;
    case "expired":
      return "The request ran out of time";
    case "withdrawn":
      return `${actor} stepped back from driving`;
    case "consent_revoked":
      return `${actor} withdrew approval`;
    default:
      return "The request was closed";
  }
}

async function loadReplacementPanel({
  status,
  familyId,
  revision,
  frozen,
  options,
  after,
  show,
}: {
  status: DriverStatus;
  familyId: string;
  revision: number;
  frozen: boolean;
  options: DriverOption[];
  after?: string;
  // One part alone, so a screen can place the request above its other actions
  // and the past changes below them. Both when left out.
  show?: "ask" | "history";
}) {
  if (
    after &&
    (!/^\d{1,16}$/.test(after) ||
      !Number.isSafeInteger(Number(after)) ||
      Number(after) < 1)
  )
    throw new Error("That page isn’t available. Open the ride again.");
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
  if (original.error || history.error)
    throw new Error(
      "Pool couldn’t load this ride’s driver changes. Try again.",
    );
  // Someone else can be asked while a driver holds the ride, nobody is being
  // asked already, and pickup is still ahead.
  const canAsk =
    status.coverage === "confirmed" &&
    Boolean(status.current_assignment_id) &&
    status.proposal_status !== "pending" &&
    !frozen &&
    !status.cancelled_at &&
    Date.parse(status.starts_at) > Date.now();
  const candidates = options.filter(
    (option) =>
      option.driver_id !== original.data?.driver_id &&
      option.passenger_seats >= status.rider_count,
  );
  return {
    model: {
      status,
      familyId,
      revision,
      after,
      history,
      candidates,
      canAsk: canAsk && show !== "history",
      showHistory: show !== "ask",
    },
  };
}

// "Ask someone else to drive": the current driver keeps the ride until the new
// one says yes. Nobody else has to approve. Past changes sit behind a disclosure.
export const ReplacementPanel = createPanel(
  "loadReplacementPanel",
  loadReplacementPanel,
  ({
    status,
    familyId,
    revision,
    after,
    history,
    candidates,
    canAsk,
    showHistory,
  }) => {
    const holder = status.is_current_driver
      ? "You keep"
      : `${firstName(status.current_driver_name || status.driver_name)} keeps`;
    const title = status.is_current_driver
      ? "Ask someone to take over"
      : "Ask someone else to drive";
    return (
      <>
        {canAsk && (
          <ActionDialog title={title}>
            <AskDriverForm
              command="requestReplacement"
              fields={{
                ride_id: status.ride_id,
                family_id: familyId,
                revision: String(revision),
                mode: "optional_swap",
                original_assignment_id: status.current_assignment_id,
                original_assignment_revision: String(
                  status.current_assignment_revision,
                ),
                // The request stays open until pickup; nobody sets a deadline.
                deadline: new Date(status.starts_at).toISOString(),
              }}
              options={candidates}
              outcome={(name) =>
                `${holder} driving until ${name} says yes. Then every family on the ride is told.`
              }
            />
          </ActionDialog>
        )}
        {showHistory && (history.data.length > 0 || after) && (
          <Disclosure title="Driver changes so far" open={Boolean(after)}>
            {history.data.length ? (
              <UI.List className="activity-list">
                {history.data.slice(0, 25).map((event) => (
                  <UI.ListItem key={event.id}>
                    <UI.Paragraph style={{ marginVertical: 0 }}>
                      {changeText(event.kind, event.actor_name)}
                      {" · "}
                      <UI.Inline dateTime={event.occurred_at}>
                        {rideTimeShort(event.occurred_at, status.timezone)}
                      </UI.Inline>
                    </UI.Paragraph>
                  </UI.ListItem>
                ))}
              </UI.List>
            ) : (
              <UI.Paragraph>Nothing more to show.</UI.Paragraph>
            )}
            {history.data.length > 25 && (
              <Link
                href={`/app/rides/${status.ride_id}?${new URLSearchParams({ family: familyId, after_replacement: String(history.data[24].id) })}`}
              >
                Show later changes
              </Link>
            )}
            {after && (
              <Link href={`/app/rides/${status.ride_id}?family=${familyId}`}>
                Back to the first changes
              </Link>
            )}
          </Disclosure>
        )}
      </>
    );
  },
);
