import assert from "node:assert/strict";
import test from "node:test";
import { rideSummary } from "../src/lib/ride-state.ts";

const read = (facts) => {
  const { label, tone, detail, mine } = rideSummary(facts);
  return [label, tone, detail, mine];
};
const joined = { familyStatus: "joined" };
const asked = {
  coverage: "awaiting_confirmation",
  proposal_status: "pending",
  mode: "initial",
  driver_name: "Alex Rivera",
  accepted_at: null,
};
const covered = {
  coverage: "confirmed",
  proposal_status: "confirmed",
  mode: "initial",
  driver_name: "Alex Rivera",
  current_driver_name: "Alex Rivera",
};

test("a ride with nobody asked needs a driver, whoever has or has not replied", () => {
  assert.deepEqual(read(joined), [
    "Needs driver",
    "open",
    "No one is driving yet",
    false,
  ]);
  assert.deepEqual(read({ ...joined, status: null }), read(joined));
  // A driver who dropped out is the news until someone new is asked.
  const left = {
    current_assignment_release_reason: "withdrawn",
    current_driver_name: "Alex Rivera",
    driver_name: "Alex Rivera",
  };
  assert.deepEqual(read({ ...joined, status: left }), [
    "Needs driver",
    "open",
    "Alex can’t drive anymore",
    false,
  ]);
  assert.deepEqual(read({ ...joined, status: { ...left, is_driver: true } }), [
    "Needs driver",
    "open",
    "You stopped driving · it needs a driver",
    false,
  ]);
});

test("someone asked is a wait named for them; being asked is this person's reply", () => {
  assert.deepEqual(read({ ...joined, status: asked }), [
    "Asked Alex",
    "waiting",
    "Waiting for Alex to say yes",
    false,
  ]);
  assert.deepEqual(read({ status: { ...asked, is_driver: true } }), [
    "Your reply",
    "act",
    "You were asked to drive",
    true,
  ]);
  // Asked to take over a ride that already has a driver.
  assert.deepEqual(
    read({
      ...joined,
      status: {
        ...covered,
        proposal_status: "pending",
        mode: "optional_swap",
        driver_name: "Bea Brooks",
        is_driver: true,
        accepted_at: null,
      },
    }),
    ["Your reply", "act", "Can you take over from Alex?", true],
  );
});

test("a driver's yes covers the ride with no approval from anyone", () => {
  assert.deepEqual(read({ ...joined, status: covered }), [
    "Covered",
    "set",
    "Alex is driving",
    false,
  ]);
  assert.deepEqual(
    read({ ...joined, status: { ...covered, is_current_driver: true } }),
    ["You’re driving", "set", "You’re driving", false],
  );
  // A swap that is only asked leaves the ride covered and says who was asked.
  assert.deepEqual(
    read({
      ...joined,
      status: {
        ...covered,
        proposal_status: "pending",
        mode: "optional_swap",
        driver_name: "Bea Brooks",
      },
    }),
    ["Covered", "set", "Alex is driving · Bea was asked to take over", false],
  );
});

test("an invitation is this family's move and names the driver when there is one", () => {
  assert.deepEqual(read({ familyStatus: "invited" }), [
    "Invited",
    "act",
    "Join or decline for your family",
    true,
  ]);
  assert.deepEqual(read({ familyStatus: "invited", status: covered }), [
    "Invited",
    "act",
    "Alex is driving · join or decline",
    true,
  ]);
  for (const familyStatus of ["declined", "withdrawn"])
    assert.deepEqual(read({ familyStatus, status: covered }), [
      "Not riding",
      "neutral",
      "Your family isn’t on this ride",
      false,
    ]);
});

test("the trip reads On the way, Dropping off, Confirm handoff, then Completed", () => {
  const trip = { ...joined, status: covered, started: true };
  assert.deepEqual(read(trip), ["On the way", "set", "Alex is driving", false]);
  assert.deepEqual(read({ ...trip, awaitingReceipts: 2 }), [
    "Dropping off",
    "waiting",
    "2 children are waiting for a guardian",
    false,
  ]);
  assert.deepEqual(read({ ...trip, awaitingReceipts: 2, myReceipts: 1 }), [
    "Confirm handoff",
    "act",
    "Confirm you have your child",
    true,
  ]);
  assert.deepEqual(read({ ...trip, completed: true }), [
    "Completed",
    "neutral",
    "Alex drove",
    false,
  ]);
  assert.deepEqual(read({ ...trip, cancelled: true, completed: true }), [
    "Cancelled",
    "neutral",
    "This ride was cancelled",
    false,
  ]);
});

test("every badge stays short and none of the retired labels remain", () => {
  const labels = [
    read(joined),
    read({ ...joined, status: asked }),
    read({ ...joined, status: { ...asked, driver_name: "" } }),
    read({ status: { ...asked, is_driver: true } }),
    read({ ...joined, status: covered }),
    read({ ...joined, status: { ...covered, is_current_driver: true } }),
    read({ familyStatus: "invited" }),
    read({ familyStatus: "declined" }),
    read({ ...joined, status: covered, started: true }),
    read({ ...joined, started: true, awaitingReceipts: 1 }),
    read({ ...joined, started: true, awaitingReceipts: 1, myReceipts: 1 }),
    read({ ...joined, completed: true }),
    read({ ...joined, cancelled: true }),
  ].map(([label]) => label);
  for (const label of labels) {
    // One or two words, except "On the way".
    assert.ok(label.split(" ").length <= (label === "On the way" ? 3 : 2), label);
    assert.doesNotMatch(label, /Pending|Receipt due|In progress|Declined/);
  }
});
