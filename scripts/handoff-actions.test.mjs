import { Fields } from "../src/services/fields.ts";
import assert from "node:assert/strict";
import test, { after, beforeEach, mock } from "node:test";
import { registerAuthTestLoader } from "./auth-test-loader.mjs";
const loader = registerAuthTestLoader();
let authenticated = true;
const rpc = mock.fn(async () => ({ data: "picked_up", error: null }));
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
const { handoffAction } = await import("../src/services/handoff-actions.ts");
loader.deregister();
after(() => mock.restoreAll());
const fields = {
  ride_id: crypto.randomUUID(),
  child_id: crypto.randomUUID(),
  recipient_id: crypto.randomUUID(),
  request_id: crypto.randomUUID(),
  revision: "3",
  version: "1",
  confirm: "yes",
};
function form(values) {
  const data = new Fields();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
}
const commands = [
  "designateRecipient",
  "recordPickup",
  "reportArrival",
  "confirmHandoff",
];
beforeEach(() => {
  authenticated = true;
  rpc.mock.resetCalls();
  rpc.mock.mockImplementation(async () => ({ data: "picked_up", error: null }));
});
test("all trip actions authenticate; submitted actor, time, status and prior result cannot fabricate events", async () => {
  authenticated = false;
  for (const command of commands)
    assert.match(
      (
        await handoffAction(
          { message: "completed" },
          form({ ...fields, command }),
        )
      ).error,
      /Sign in/,
    );
  assert.equal(rpc.mock.callCount(), 0);
  authenticated = true;
  await handoffAction(
    {},
    form({
      ...fields,
      command: "reportArrival",
      actor_id: "spoof",
      occurred_at: "2020-01-01",
      status: "completed",
    }),
  );
  assert.deepEqual(rpc.mock.calls[0].arguments, [
    "report_arrival",
    {
      p_ride_id: fields.ride_id,
      p_child_id: fields.child_id,
      p_revision: 3,
      p_version: 1,
      p_request_id: fields.request_id,
    },
  ]);
});
test("receipt always needs explicit acknowledgment; invalid inputs stop before any RPC", async () => {
  for (const command of commands)
    for (const changes of [
      { confirm: "" },
      { version: "-1" },
      { revision: "0" },
      { child_id: "bad" },
      { version: "1.2" },
    ])
      assert.ok(
        (await handoffAction({}, form({ ...fields, command, ...changes })))
          .error,
      );
  for (const command of ["recordPickup", "reportArrival", "confirmHandoff"])
    for (const changes of [{ version: "0" }, { request_id: "bad" }])
      assert.ok(
        (await handoffAction({}, form({ ...fields, command, ...changes })))
          .error,
      );
  assert.equal(rpc.mock.callCount(), 0);
  await handoffAction(
    {},
    form({ ...fields, version: "0", command: "designateRecipient" }),
  );
  assert.deepEqual(rpc.mock.calls[0].arguments, [
    "designate_recipient",
    {
      p_ride_id: fields.ride_id,
      p_child_id: fields.child_id,
      p_recipient_id: fields.recipient_id,
      p_revision: 3,
      p_version: 0,
    },
  ]);
});
test("authority, stale progress, unmet start conditions and frozen trips remain errors in every server action", async () => {
  for (const command of commands)
    for (const [code, pattern] of [
      ["PT404", /unavailable/],
      ["PT409", /Reload/],
      ["PT422", /recipient/],
      ["PT423", /frozen/],
      ["PT424", /unfinished/],
      ["XX000", /could not save/],
    ]) {
      rpc.mock.mockImplementation(async () => ({
        data: null,
        error: { code, message: "private database information" },
      }));
      const r = await handoffAction({}, form({ ...fields, command }));
      assert.match(r.error, pattern);
      assert.equal(r.message, undefined);
    }
});
