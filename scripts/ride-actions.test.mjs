import { Fields } from "../src/services/fields.ts";
import assert from "node:assert/strict";
import test, { after, beforeEach, mock } from "node:test";
import { registerAuthTestLoader } from "./auth-test-loader.mjs";
const loader = registerAuthTestLoader();
let authenticated = true;
const rpc = mock.fn(async () => ({ data: "saved-id", error: null }));
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
    }),
  },
});
mock.module(new URL("../src/services/cache.ts", import.meta.url).href, {
  exports: { revalidatePath: mock.fn() },
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
      ["PT404", /unavailable/],
      ["PT409", /Reload/],
      ["XX000", /could not save/],
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
  assert.match((await rideAction({}, form(fields))).error, /could not save/);
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
