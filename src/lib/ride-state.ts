import type { DriverStatus } from "./drivers";

// One reading of a ride for whoever is looking at it: a one-or-two-word badge
// and a plain line that says who has to do what. Every list and card uses this
// so the same ride never has two different names for its state.
//
// The tone answers "whose move is it?" and each tone looks different:
//   act      you have to do something          solid sun
//   open     the ride has no driver, anyone can outlined sun, car icon
//   waiting  someone else has to answer         grey, clock icon
//   set      it is settled                      sky wash, check icon
//   neutral  over or off                        grey, no icon
export type RideTone = "act" | "open" | "waiting" | "set" | "neutral";
export type RideSummary = {
  label: string;
  tone: RideTone;
  detail: string;
  // True when the next move belongs to the person looking.
  mine: boolean;
};
type StatusFacts = Pick<
  DriverStatus,
  | "coverage"
  | "accepted_at"
  | "proposal_status"
  | "mode"
  | "driver_name"
  | "current_driver_name"
  | "current_assignment_release_reason"
  | "is_driver"
  | "is_current_driver"
  | "is_completed_driver"
>;

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export function rideSummary({
  familyStatus,
  cancelled,
  status,
  started = false,
  completed = false,
  awaitingReceipts = 0,
  myReceipts = 0,
}: {
  // This family's reply to the ride: "invited", "joined" or "declined".
  familyStatus?: string;
  cancelled?: boolean;
  status?: Partial<StatusFacts> | null;
  started?: boolean;
  completed?: boolean;
  // Children dropped off and waiting for a guardian to confirm.
  awaitingReceipts?: number;
  // How many of those this person is the one to confirm.
  myReceipts?: number;
}): RideSummary {
  const driver = firstName(
    status?.current_driver_name || status?.driver_name || "",
  );
  const asked = status?.driver_name ? firstName(status.driver_name) : "";
  const iDrive = Boolean(
    status?.is_current_driver || status?.is_completed_driver,
  );
  if (cancelled)
    return { label: "Cancelled", tone: "neutral", detail: "This ride was cancelled", mine: false };
  if (completed)
    return {
      label: "Completed",
      tone: "neutral",
      detail: driver ? `${iDrive ? "You" : driver} drove` : "Every child was handed off",
      mine: false,
    };
  if (myReceipts > 0)
    return {
      label: "Confirm handoff",
      tone: "act",
      detail: `Confirm you have ${myReceipts === 1 ? "your child" : "your children"}`,
      mine: true,
    };
  if (awaitingReceipts > 0)
    return {
      label: "Dropping off",
      tone: "waiting",
      detail: `${awaitingReceipts} ${awaitingReceipts === 1 ? "child is" : "children are"} waiting for a guardian`,
      mine: false,
    };
  if (started)
    return {
      label: "On the way",
      tone: "set",
      detail: iDrive ? "You’re driving" : driver ? `${driver} is driving` : "The trip has started",
      mine: iDrive,
    };
  if (familyStatus === "declined" || familyStatus === "withdrawn")
    return { label: "Not riding", tone: "neutral", detail: "Your family isn’t on this ride", mine: false };
  const swap = status?.proposal_status === "pending" && status.mode !== "initial";
  const covered = status?.coverage === "confirmed";
  if (familyStatus && familyStatus !== "joined")
    return {
      label: "Invited",
      tone: "act",
      detail: covered
        ? `${driver} is driving · join or decline`
        : "Join or decline for your family",
      mine: true,
    };
  // Asked to drive, or to take over: that is this person's move even when the
  // ride already has a driver.
  if (
    status?.proposal_status === "pending" &&
    status.is_driver &&
    !status.accepted_at
  )
    return {
      label: "Your reply",
      tone: "act",
      detail: covered
        ? `Can you take over from ${driver}?`
        : "You were asked to drive",
      mine: true,
    };
  if (covered)
    return {
      label: iDrive ? "You’re driving" : "Covered",
      tone: "set",
      detail: `${iDrive ? "You’re" : `${driver} is`} driving${
        swap && asked ? ` · ${asked} was asked to take over` : ""
      }`,
      mine: false,
    };
  if (status?.coverage === "awaiting_confirmation")
    return {
      label: asked ? `Asked ${asked}` : "Driver asked",
      tone: "waiting",
      detail: status.accepted_at
        ? `Confirming ${asked || "the driver"}`
        : `Waiting for ${asked || "the driver"} to say yes`,
      mine: false,
    };
  const left =
    status?.current_assignment_release_reason === "withdrawn" &&
    status.current_driver_name
      ? firstName(status.current_driver_name)
      : "";
  return {
    label: "Needs driver",
    tone: "open",
    detail: left
      ? status?.is_driver && status.driver_name === status.current_driver_name
        ? "You stopped driving · it needs a driver"
        : `${left} can’t drive anymore`
      : "No one is driving yet",
    mine: false,
  };
}
