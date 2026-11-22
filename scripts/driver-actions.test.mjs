import { Fields } from "../src/services/fields.ts";
import assert from "node:assert/strict";
import test, { after, beforeEach, mock } from "node:test";
import { registerAuthTestLoader } from "./auth-test-loader.mjs";
const loader = registerAuthTestLoader();
let authenticated = true;
const rpc = mock.fn(async () => ({
  data: "awaiting_confirmation",
  error: null,
}));
// Rows the follow-up reads see, by table, and every read that was made. Empty
// tables mean a family has no riders of its own on the ride.
let tables = {};
const reads = [];
function from(table) {
  const read = { table, filters: {} };
  reads.push(read);
  const rows = () => tables[table] ?? [];
  const query = {
    select: () => query,
    eq: (column, value) => ((read.filters[column] = value), query),
    in: (column, value) => ((read.filters[column] = value), query),
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (resolve, reject) =>
      Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
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
  exports: { revalidatePath: mock.fn() },
});
const { driverAction } = await import("../src/services/driver-actions.ts");
loader.deregister();
after(() => mock.restoreAll());
const family = crypto.randomUUID(),
  child = crypto.randomUUID(),
  proposal = crypto.randomUUID(),
  vehicle = crypto.randomUUID(),
  driver = crypto.randomUUID(),
  driverFamily = crypto.randomUUID(),
  ride = crypto.randomUUID(),
  request = crypto.randomUUID();
// Each command's own database call, apart from best-effort follow-ups.
const called = (name) =>
  rpc.mock.calls
    .filter((call) => call.arguments[0] === name)
    .map((call) => call.arguments[1]);
// The database answers each call by name; `overrides` replaces single answers.
const answers = (overrides = {}) => async (name) =>
  overrides[name] ??
  (name === "ride_offer"
    ? {
        data: [
          { family_id: family, revision: 7 },
          { family_id: driverFamily, revision: 8 },
        ],
        error: null,
      }
    : { data: "awaiting_confirmation", error: null });
function form(values) {
  const data = new Fields();
  for (const [k, v] of Object.entries(values))
    for (const x of Array.isArray(v) ? v : [v]) data.append(k, x);
  return data;
}
const base = {
  mode: "optional_swap",
  deadline: "2028-09-01T14:00:00Z",
  original_assignment_id: crypto.randomUUID(),
  original_assignment_revision: "3",
  proposal_id: proposal,
  revision: "3",
  family_id: family,
  child_ids: [child],
  vehicle_id: vehicle,
  label: "Own car",
  passenger_seats: "4",
  version: "0",
  available_seats: "4",
  restraints: "yes",
  ride_id: ride,
  driver_vehicle: [driver, family, vehicle, "1"].join("|"),
  request_id: request,
  vehicle_version: "1",
  vehicle_selection: [vehicle, "1", "4"].join("|"),
};
const commands = [
  "saveVehicle",
  "proposeDriver",
  "requestReplacement",
  "acceptDriverProposal",
  "offerToDrive",
  "requestRideVehicleChange",
  "declineDriverProposal",
  "cancelDriverProposal",
  "withdrawDriver",
];
beforeEach(() => {
  authenticated = true;
  tables = {};
  reads.length = 0;
  rpc.mock.resetCalls();
  rpc.mock.mockImplementation(answers());
});
test("every driver action reauthenticates and ignores forged prior success", async () => {
  authenticated = false;
  for (const command of commands)
    assert.match(
      (await driverAction({ message: "Confirmed" }, form({ ...base, command })))
        .error,
      /Sign in/,
    );
  assert.equal(rpc.mock.callCount(), 0);
  assert.equal(reads.length, 0);
});
test("nomination binds selection and request ID; a driver's yes carries no child IDs and needs no family's approval", async () => {
  await driverAction(
    {},
    form({
      ...base,
      command: "proposeDriver",
      actor_id: "spoof",
      status: "confirmed",
    }),
  );
  assert.equal(rpc.mock.calls[0].arguments[0], "propose_driver");
  const [args] = called("propose_driver");
  assert.equal(args.p_driver_id, driver);
  assert.equal(args.p_vehicle_version, 1);
  assert.equal(args.p_id, proposal);
  assert.equal(Object.hasOwn(args, "p_actor_id"), false);
  rpc.mock.resetCalls();
  await driverAction({}, form({ ...base, command: "acceptDriverProposal" }));
  assert.equal(rpc.mock.calls[0].arguments[0], "accept_driver_proposal");
  const [accepted] = called("accept_driver_proposal");
  assert.equal(accepted.p_restraints, true);
  assert.equal(Object.hasOwn(accepted, "p_child_ids"), false);
});
test("asking, offering or agreeing to drive is one database call: no approval, no handoff change and no extra read follows", async () => {
  tables = {
    ride_riders: [{ child_id: child }],
    driver_proposals: [{ ride_id: ride, driver_family_id: driverFamily }],
    ride_handoffs: [],
  };
  for (const [command, name] of [
    ["proposeDriver", "propose_driver"],
    ["requestReplacement", "request_replacement"],
    ["acceptDriverProposal", "accept_driver_proposal"],
    ["offerToDrive", "offer_to_drive"],
  ]) {
    rpc.mock.resetCalls();
    reads.length = 0;
    const result = await driverAction({}, form({ ...base, command }));
    assert.equal(result.error, undefined, command);
    assert.deepEqual(
      rpc.mock.calls.map((call) => call.arguments[0]),
      [name],
      command,
    );
    assert.equal(reads.length, 0, command);
  }
  // The retired approval commands are refused before any database call.
  rpc.mock.resetCalls();
  for (const command of ["consentForOwnChildren", "revokeOwnConsent"])
    assert.match(
      (await driverAction({}, form({ ...base, command }))).error,
      /doesn.t fit/,
    );
  assert.equal(rpc.mock.callCount(), 0);
});
test("offering to drive sets the ride at once and explains each refusal in plain words", async () => {
  const offer = () =>
    driverAction({}, form({ ...base, command: "offerToDrive" }));
  assert.deepEqual(await offer(), {
    path: `/app/rides/${ride}`,
    message: "You’re driving",
  });
  assert.deepEqual(called("offer_to_drive"), [
    {
      p_id: request,
      p_ride_id: ride,
      p_family_id: family,
      p_revision: 3,
      p_vehicle_id: vehicle,
      p_vehicle_version: 1,
      p_available_seats: 4,
      p_restraints: true,
    },
  ]);
  for (const [message, pattern] of [
    ["already_assigned_or_pending", /already lined up to drive/],
    ["insufficient_seats", /can.t take every rider/],
    ["capacity_or_restraints", /can.t take every rider/],
    ["driver_unavailable", /already driving another ride/],
  ]) {
    rpc.mock.mockImplementation(async () => ({
      data: null,
      error: { code: "PT422", message },
    }));
    const result = await offer();
    assert.match(result.error, pattern);
    assert.equal(result.message, undefined);
    assert.equal(result.path, undefined);
  }
});
test("a driver's own car change is done in one step when the booster/child-seat check is ticked, and stays pending otherwise", async () => {
  const change = (values = {}) =>
    driverAction(
      {},
      form({ ...base, command: "requestRideVehicleChange", ...values }),
    );
  rpc.mock.mockImplementation(async (name) => ({
    data: name === "accept_driver_proposal" ? "confirmed" : request,
    error: null,
  }));
  const switched = await change();
  assert.equal(switched.message, "Car changed");
  assert.equal(switched.path, `/app/rides/${ride}`);
  assert.deepEqual(rpc.mock.calls.map((call) => call.arguments), [
    [
      "request_ride_vehicle_change",
      {
        p_id: request,
        p_proposal_id: proposal,
        p_revision: 3,
        p_vehicle_id: vehicle,
        p_vehicle_version: 1,
      },
    ],
    [
      "accept_driver_proposal",
      {
        p_id: request,
        p_revision: 3,
        p_available_seats: 4,
        p_restraints: true,
      },
    ],
  ]);
  // Someone who was only asked becomes the driver by choosing a car.
  assert.equal((await change({ first: "yes" })).message, "You’re driving");
  // Without the tick, or without the seat count, only the request is made.
  for (const values of [
    { restraints: "" },
    { vehicle_selection: [vehicle, "1"].join("|") },
  ]) {
    rpc.mock.resetCalls();
    const pending = await change(values);
    assert.equal(pending.message, "Finish the car change on the ride");
    assert.deepEqual(
      rpc.mock.calls.map((call) => call.arguments[0]),
      ["request_ride_vehicle_change"],
    );
  }
  // A refused request is never followed by an acceptance.
  rpc.mock.resetCalls();
  rpc.mock.mockImplementation(async () => ({
    data: null,
    error: { code: "PT422", message: "private database detail" },
  }));
  assert.match((await change()).error, /This car can.t take the ride/);
  assert.equal(rpc.mock.callCount(), 1);
});
test("a car that is on a ride says so when it is edited or removed", async () => {
  rpc.mock.mockImplementation(async () => ({
    data: null,
    error: { code: "PT423", message: "vehicle_in_use" },
  }));
  for (const extra of [{}, { retire: "yes", confirm: "yes" }]) {
    const result = await driverAction(
      {},
      form({ ...base, command: "saveVehicle", ...extra }),
    );
    assert.equal(
      result.error,
      "This car is on a ride. Use a different car for that ride first.",
    );
    assert.equal(result.message, undefined);
  }
});
test("malformed seats, child IDs, duplicate children, versions and an unconfirmed booster/child-seat check stop before RPC", async () => {
  for (const change of [
    { command: "saveVehicle", passenger_seats: "0" },
    { command: "saveVehicle", passenger_seats: "1.5" },
    { command: "saveVehicle", version: "-1" },
    { command: "proposeDriver", driver_vehicle: "bad" },
    { command: "acceptDriverProposal", restraints: "" },
    { command: "acceptDriverProposal", available_seats: "0" },
    { command: "offerToDrive", available_seats: "0" },
    { command: "offerToDrive", vehicle_version: "0" },
    { command: "offerToDrive", request_id: "spoof" },
    { command: "requestRideVehicleChange", vehicle_selection: "bad" },
    { command: "requestRideVehicleChange", vehicle_selection: `${vehicle}|0` },
    { command: "withdrawDriver", revision: "0" },
    { command: "withdrawDriver", proposal_id: "spoof" },
  ])
    assert.match(
      (await driverAction({}, form({ ...base, ...change }))).error,
      /doesn.t fit/,
    );
  assert.equal(rpc.mock.callCount(), 0);
  assert.equal(reads.length, 0);
});
test("pressing the button is the confirmation: no command needs a confirm field, and each reaches its own RPC with the submitted values", async () => {
  assert.equal(Object.hasOwn(base, "confirm"), false);
  const request = { p_id: proposal, p_revision: 3 };
  const nomination = {
    ...request,
    p_ride_id: ride,
    p_family_id: family,
    p_driver_id: driver,
    p_driver_family_id: family,
    p_vehicle_id: vehicle,
    p_vehicle_version: 1,
  };
  for (const [command, name, args] of [
    ["proposeDriver", "propose_driver", nomination],
    [
      "requestReplacement",
      "request_replacement",
      {
        ...nomination,
        p_mode: "optional_swap",
        p_deadline: "2028-09-01T14:00:00.000Z",
        p_original_assignment_id: base.original_assignment_id,
        p_original_assignment_revision: 3,
      },
    ],
    [
      "acceptDriverProposal",
      "accept_driver_proposal",
      { ...request, p_available_seats: 4, p_restraints: true },
    ],
    ["declineDriverProposal", "decline_driver_proposal", request],
    [
      "cancelDriverProposal",
      "cancel_driver_proposal",
      { ...request, p_family_id: family },
    ],
    ["withdrawDriver", "withdraw_driver", request],
  ]) {
    rpc.mock.resetCalls();
    const result = await driverAction({}, form({ ...base, command }));
    assert.equal(result.error, undefined, command);
    assert.ok(result.message, command);
    assert.deepEqual(rpc.mock.calls[0].arguments, [name, args], command);
  }
});
test("database conflicts/deadlines/authority remain failures for all actions, never fabricated success", async () => {
  for (const command of commands)
    for (const [code, pattern] of [
      ["PT404", /isn.t available for this ride anymore/],
      ["PT409", /Someone else just changed this ride/],
      ["PT410", /time to reply has passed/],
      ["PT422", /This car can.t take the ride/],
      ["PT423", /can.t change after the first pickup/],
      ["PT424", /already on another ride/],
      ["XX000", /didn.t go through/],
    ]) {
      rpc.mock.resetCalls();
      rpc.mock.mockImplementation(async () => ({
        data: null,
        error: { code, message: "private database detail" },
      }));
      const result = await driverAction({}, form({ ...base, command }));
      assert.match(result.error, pattern);
      assert.doesNotMatch(result.error, /private database detail/);
      assert.equal(result.message, undefined);
      assert.equal(result.path, undefined);
      // A refused command is not followed by any other call on its behalf.
      assert.equal(rpc.mock.callCount(), 1);
    }
  rpc.mock.mockImplementation(async () => ({ data: "confirmed", error: null }));
  // "You're driving" is only said once the database reports the ride covered.
  const accept = () =>
    driverAction({}, form({ ...base, command: "acceptDriverProposal" }));
  assert.match((await accept()).message, /You.re driving/);
  rpc.mock.mockImplementation(answers());
  assert.match((await accept()).message, /Reply sent/);
});

test("driving pagination preserves a paired instant/ride cursor and pending filter", async () => {
  const { driverPageCursor, driverNextPage } =
    await import("../src/lib/drivers.ts");
  const next = driverNextPage(
    { starts_at: "2027-09-01T14:00:00+00:00", ride_id: ride },
    true,
  );
  const query = Object.fromEntries(
    new URL(next, "https://example.test").searchParams,
  );
  assert.equal(query.pending, "1");
  assert.deepEqual(driverPageCursor(query), {
    p_after_start: "2027-09-01T14:00:00.000Z",
    p_after_id: ride,
  });
  for (const bad of [
    { after_start: "2027-09-01" },
    { after_id: ride },
    { after_start: "bad", after_id: ride },
    { after_start: "2027-09-01", after_id: "bad" },
  ])
    assert.throws(() => driverPageCursor(bad), /That page isn.t available/);
});

test("replacement nomination binds explicit origin and UTC deadline; forged acceptance and consent fields are dropped and nothing is accepted for the new driver", async () => {
  await driverAction(
    {},
    form({
      ...base,
      command: "requestReplacement",
      actor_id: "forged",
      consent_count: "99",
      accepted_at: "now",
    }),
  );
  assert.equal(rpc.mock.calls[0].arguments[0], "request_replacement");
  const [args] = called("request_replacement");
  assert.equal(args.p_mode, "optional_swap");
  assert.equal(args.p_original_assignment_id, base.original_assignment_id);
  assert.equal(args.p_original_assignment_revision, 3);
  assert.equal(args.p_deadline, "2028-09-01T14:00:00.000Z");
  assert.equal(Object.hasOwn(args, "p_accepted_at"), false);
  assert.equal(Object.hasOwn(args, "p_consent_count"), false);
  // Asking for a swap does not accept it on the new driver's behalf.
  assert.deepEqual(called("accept_driver_proposal"), []);
  rpc.mock.resetCalls();
  for (const change of [
    { deadline: "2028-09-01T14:00" },
    { deadline: "invalid" },
    { mode: "auto" },
    { original_assignment_id: "fake" },
    { original_assignment_revision: "0" },
  ])
    assert.ok(
      (
        await driverAction(
          {},
          form({ ...base, command: "requestReplacement", ...change }),
        )
      ).error,
    );
  assert.equal(rpc.mock.callCount(), 0);
});
