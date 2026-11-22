import { Fields } from "../src/services/fields.ts";
import { familyChildrenKey } from "../src/services/family-children.ts";
import assert from "node:assert/strict";
import test, { after, beforeEach, mock } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { registerAuthTestLoader } from "./auth-test-loader.mjs";
const loader = registerAuthTestLoader();
let authenticated = true;
const rpc = mock.fn(async () => ({ data: "saved-id", error: null }));
const queryClient = new QueryClient();
// Children on the ride who already have someone named to meet them.
let named = [];
const reads = [];
function from(table) {
  const read = { table, filters: {} };
  reads.push(read);
  const query = {
    select: () => query,
    eq: (column, value) => ((read.filters[column] = value), query),
    in: (column, value) => ((read.filters[column] = value), query),
    then: (resolve, reject) =>
      Promise.resolve({
        data: named.map((child_id) => ({ child_id })),
        error: null,
      }).then(resolve, reject),
  };
  return query;
}
mock.module(new URL("../src/lib/supabase/client.ts", import.meta.url).href, {
  exports: {
    createClient: async () => ({
      auth: {
        getUser: async () => ({
          data: {
            user: authenticated
              ? {
                  id: "actor",
                  email: "adult@example.test",
                  email_confirmed_at: "yes",
                }
              : null,
          },
          error: null,
        }),
      },
      rpc,
      from,
    }),
  },
});
mock.module(new URL("../src/services/cache.ts", import.meta.url).href, {
  exports: { queryClient, revalidatePath: mock.fn() },
});
const { rideAction } = await import("../src/services/ride-actions.ts");
loader.deregister();
after(() => mock.restoreAll());
const family = crypto.randomUUID(),
  child = crypto.randomUUID(),
  ride = crypto.randomUUID();
const fields = {
  command: "createRide",
  family_id: family,
  circle_id: crypto.randomUUID(),
  ride_id: ride,
  pickup_summary: "Area A",
  destination_summary: "Area B",
  pickup: "101 Private",
  destination: "202 Private",
  timezone: "America/Denver",
  starts_local: "2027-11-07T01:30",
  ends_local: "2027-11-07T02:30",
  start_occurrence: "earlier",
  end_occurrence: "reject",
  direction: "outbound",
  child_ids: [child],
};
function form(values) {
  const data = new Fields();
  for (const [key, value] of Object.entries(values))
    for (const item of Array.isArray(value) ? value : [value])
      data.append(key, item);
  return data;
}
beforeEach(() => {
  authenticated = true;
  named = [];
  reads.length = 0;
  queryClient.clear();
  rpc.mock.resetCalls();
  rpc.mock.mockImplementation(async () => ({ data: "saved-id", error: null }));
});
test("every ride action authenticates and ignores supplied actor or previous success", async () => {
  authenticated = false;
  for (const command of [
    "saveOwnChild",
    "createRide",
    "respondToRideInvitation",
    "setOwnRideRiders",
    "cancelRide",
  ])
    assert.match(
      (await rideAction({ message: "Saved" }, form({ ...fields, command })))
        .error,
      /Sign in/,
    );
  assert.equal(rpc.mock.callCount(), 0);
});
test("create uses explicit zone, stable request ID, own context and public-session RPC", async () => {
  const result = await rideAction({}, form({ ...fields, created_by: "spoof" }));
  assert.equal(result.path, `/app/rides/${ride}`);
  const [name, args] = rpc.mock.calls[0].arguments;
  assert.equal(name, "create_ride");
  assert.equal(args.p_starts_at, "2027-11-07T07:30:00.000Z");
  assert.equal(args.p_ends_at, "2027-11-07T09:30:00.000Z");
  assert.equal(args.p_id, ride);
  assert.equal(args.p_family_id, family);
  assert.equal(Object.hasOwn(args, "p_created_by"), false);
});
test("closed daylight-saving controls default to rejecting repeated hours", async () => {
  const draft = {
    ...fields,
    start_occurrence: undefined,
    end_occurrence: undefined,
  };
  const repeated = await rideAction({}, draft);
  assert.match(repeated.error, /occurs twice/);
  assert.equal(rpc.mock.callCount(), 0);

  const result = await rideAction({}, { ...draft, starts_local: "2027-11-07T00:30" });
  assert.equal(result.path, `/app/rides/${ride}`);
  const [, args] = rpc.mock.calls[0].arguments;
  assert.equal(args.p_starts_at, "2027-11-07T06:30:00.000Z");
});
test("a confirmed child save updates the scoped roster without replacing a newer revision", async () => {
  const roster = familyChildrenKey("actor", family);
  const otherRoster = familyChildrenKey("another adult", family);
  queryClient.setQueryData(roster, []);
  queryClient.setQueryData(otherRoster, []);
  rpc.mock.mockImplementation(async () => ({ data: child, error: null }));
  const draft = form({
    command: "saveOwnChild",
    child_id: child.toUpperCase(),
    family_id: family.toUpperCase(),
    display_name: "  Kid  ",
    seat_requirement: "booster",
    revision: "0",
  });
  const saved = {
    id: child,
    display_name: "Kid",
    seat_requirement: "booster",
    revision: 1,
  };
  assert.deepEqual(await rideAction({}, draft), { message: "Child added" });
  assert.deepEqual(queryClient.getQueryData(roster), [saved]);
  assert.deepEqual(queryClient.getQueryData(otherRoster), []);

  // A newer roster read can win the race with the original save response.
  const newer = { ...saved, display_name: "Edited Kid", revision: 2 };
  queryClient.setQueryData(roster, [newer]);
  assert.deepEqual(await rideAction({}, draft), { message: "Child added" });
  assert.deepEqual(queryClient.getQueryData(roster), [newer]);
});
test("malformed input, duplicate children, gaps and ambiguous or backwards times stop before RPC", async () => {
  for (const changes of [
    { family_id: "bad" },
    { child_ids: [child, child] },
    { child_ids: [] },
    { starts_local: "2027-03-14T02:30" },
    { start_occurrence: "reject" },
    { ends_local: "2027-11-06T20:30" },
  ])
    assert.ok((await rideAction({}, form({ ...fields, ...changes }))).error);
  assert.equal(rpc.mock.callCount(), 0);
});
test("all mutations preserve DB authority denials, stale conflicts, and backend failures", async () => {
  const actions = [
    {
      command: "saveOwnChild",
      child_id: child,
      display_name: "Kid",
      seat_requirement: "booster",
      revision: "0",
    },
    { command: "respondToRideInvitation", response: "join", revision: "1" },
    { command: "setOwnRideRiders", revision: "1" },
    { command: "cancelRide", revision: "1", confirm: "yes" },
  ];
  for (const extra of actions)
    for (const [code, pattern] of [
      ["PT404", /isn’t available/],
      [
        "PT409",
        extra.command === "saveOwnChild" ? /already be saved/ : /just changed/,
      ],
      ["XX000", /didn’t go through/],
    ]) {
      rpc.mock.mockImplementation(async () => ({
        error: { code, message: "private database detail" },
      }));
      const result = await rideAction({}, form({ ...fields, ...extra }));
      assert.match(result.error, pattern);
      assert.equal(result.path, undefined);
      assert.equal(result.message, undefined);
    }
  rpc.mock.mockImplementation(async () => {
    throw new Error("private network failure");
  });
  assert.match((await rideAction({}, form(fields))).error, /didn’t go through/);
  rpc.mock.resetCalls();
  assert.ok(
    (
      await rideAction(
        {},
        form({ ...fields, command: "cancelRide", revision: "1" }),
      )
    ).error,
  );
  assert.equal(rpc.mock.callCount(), 0);
});
test("joining, creating or changing riders names the acting guardian to meet their own children, and only where nobody is named yet", async () => {
  const other = crypto.randomUUID();
  const offers = (name) =>
    name === "ride_offer"
      ? { data: [{ family_id: family, revision: 5 }], error: null }
      : { data: "saved-id", error: null };
  const met = () =>
    rpc.mock.calls
      .filter((call) => call.arguments[0] === "designate_recipient")
      .map((call) => call.arguments[1]);
  const meeting = (id) => ({
    p_ride_id: ride,
    p_child_id: id,
    p_recipient_id: "actor",
    p_revision: 5,
    p_version: 0,
  });
  rpc.mock.mockImplementation(async (name) => offers(name));
  for (const [extra, message] of [
    [{}, "Ride created"],
    [
      { command: "respondToRideInvitation", response: "join", revision: "1" },
      "You’re in",
    ],
    [{ command: "setOwnRideRiders", revision: "1" }, "Riders updated"],
  ]) {
    rpc.mock.resetCalls();
    reads.length = 0;
    const result = await rideAction(
      {},
      form({ ...fields, ...extra, child_ids: [child, other] }),
    );
    assert.equal(result.message, message);
    assert.deepEqual(reads, [
      {
        table: "ride_handoffs",
        filters: { ride_id: ride, child_id: [child, other] },
      },
    ]);
    assert.deepEqual(met(), [meeting(child), meeting(other)]);
  }
  // A child who already has someone named keeps them.
  named = [child];
  rpc.mock.resetCalls();
  await rideAction(
    {},
    form({
      ...fields,
      command: "setOwnRideRiders",
      revision: "1",
      child_ids: [child, other],
    }),
  );
  assert.deepEqual(met(), [meeting(other)]);
  // Declining, or a refused change, names nobody.
  for (const extra of [
    {
      command: "respondToRideInvitation",
      response: "decline",
      revision: "1",
      child_ids: [],
    },
  ]) {
    rpc.mock.resetCalls();
    assert.equal(
      (await rideAction({}, form({ ...fields, ...extra }))).message,
      "Ride declined",
    );
    assert.deepEqual(met(), []);
  }
  // A follow-up the database refuses never fails the reply itself.
  rpc.mock.mockImplementation(async (name) =>
    name === "designate_recipient" || name === "ride_offer"
      ? { data: null, error: { code: "PT404", message: "private detail" } }
      : { data: "saved-id", error: null },
  );
  const joined = await rideAction(
    {},
    form({
      ...fields,
      command: "respondToRideInvitation",
      response: "join",
      revision: "1",
    }),
  );
  assert.deepEqual(joined, { message: "You’re in", path: undefined });
});
test("a full car explains what to do and changes nothing else", async () => {
  for (const extra of [
    { command: "respondToRideInvitation", response: "join", revision: "1" },
    { command: "setOwnRideRiders", revision: "1" },
  ]) {
    rpc.mock.resetCalls();
    rpc.mock.mockImplementation(async () => ({
      data: null,
      error: { code: "PT422", message: "car_full" },
    }));
    const result = await rideAction({}, form({ ...fields, ...extra }));
    assert.equal(
      result.error,
      "The driver’s car doesn’t have a seat for everyone. Ask the driver to switch cars, or ask someone with a bigger car to take over.",
    );
    assert.equal(result.message, undefined);
    // No handoff is named for a change that did not happen.
    assert.equal(rpc.mock.callCount(), 1);
    assert.equal(reads.length, 0);
  }
  // After the first pickup the riders are fixed.
  rpc.mock.mockImplementation(async () => ({
    data: null,
    error: { code: "PT423", message: "trip_frozen" },
  }));
  const frozen = await rideAction(
    {},
    form({ ...fields, command: "setOwnRideRiders", revision: "1" }),
  );
  assert.match(frozen.error, /can’t change after the first pickup/);
});
