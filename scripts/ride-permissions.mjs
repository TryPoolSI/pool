import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
function fixtures(status) {
  assert.equal(status.API_URL, "http://127.0.0.1:55321");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const client = () => createClient(status.API_URL, status.PUBLISHABLE_KEY || status.ANON_KEY, options);
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
  async function user(label) {
    const email = `r4-${label}-${crypto.randomUUID()}@example.test`, password = `Pool-${crypto.randomUUID()}!`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true }); assert.ifError(created.error);
    const db = client(); assert.ifError((await db.auth.signInWithPassword({ email, password })).error);
    return { db, id: created.data.user.id, email, password };
  }
  return { client, user };
}
async function ok(db, command, args) { const result = await db.rpc(command, args); assert.ifError(result.error); return result.data; }
async function denied(db, command, args, code) { const result = await db.rpc(command, args); assert.ok(result.error, `${command} denied`); if (code) assert.equal(result.error.code, code, `${command}: ${result.error.message}`); }
const childArgs = (family, name = "Own child") => ({ p_id: crypto.randomUUID(), p_family_id: family, p_display_name: name, p_seat_requirement: "booster", p_revision: 0 });
function rideArgs(family, circle, child, invited = []) { return { p_id: crypto.randomUUID(), p_family_id: family, p_circle_id: circle, p_pickup_summary: "Neighborhood", p_destination_summary: "Activity", p_pickup: "101 Private Lane, door 2", p_destination: "202 Private Drive, entrance 3", p_direction: "outbound", p_starts_at: "2027-11-07T07:30:00Z", p_ends_at: "2027-11-07T09:30:00Z", p_timezone: "America/Denver", p_child_ids: [child], p_invited_family_ids: invited }; }
export async function rideUpgradeIdentity(status) {
  const person = await fixtures(status).user("r3-upgrade");
  const family = await ok(person.db, "create_family", { p_name: "Persisted R3 family", p_display_name: "Existing R3 guardian" });
  const circle = await ok(person.db, "create_circle", { p_family_id: family, p_name: "Persisted R3 circle" });
  return async () => {
    assert.equal((await person.db.from("families").select("id").eq("id", family).single()).data.id, family);
    const args = childArgs(family), child = await ok(person.db, "save_own_child", args);
    const ride = await ok(person.db, "create_ride", rideArgs(family, circle, child));
    assert.equal((await ok(person.db, "ride_offer", { p_id: ride }))[0].status, "joined");
  };
}
export async function ridePermissionTests(status, sql) {
  const { client, user } = fixtures(status);
  const [creator, other, coordinator, unrelated, guardian, extra] = await Promise.all(["creator", "other", "coordinator", "unrelated", "guardian", "extra"].map(user));
  const family = await ok(creator.db, "create_family", { p_name: "Ride creator", p_display_name: "Creator" });
  const second = await ok(other.db, "create_family", { p_name: "Invited family", p_display_name: "Other" });
  const third = await ok(coordinator.db, "create_family", { p_name: "Coordinating family", p_display_name: "Coordinator" });
  const fourth = await ok(extra.db, "create_family", { p_name: "Extra invited family", p_display_name: "Extra" });
  const outside = await ok(unrelated.db, "create_family", { p_name: "Outside family", p_display_name: "Outside" });
  const circle = await ok(coordinator.db, "create_circle", { p_family_id: third, p_name: "Ride circle" });
  for (const [person, f] of [[creator, family], [other, second], [extra, fourth]]) {
    const invitation = (await ok(coordinator.db, "create_invitation", { p_kind: "circle", p_scope_id: circle, p_email: person.email }))[0];
    await ok(person.db, "accept_invitation", { p_kind: "circle", p_token: invitation.token, p_family_id: f, p_display_name: "Adult" });
  }
  const invitation = (await ok(other.db, "create_invitation", { p_kind: "guardian", p_scope_id: second, p_email: guardian.email }))[0];
  await ok(guardian.db, "accept_invitation", { p_kind: "guardian", p_token: invitation.token, p_display_name: "Second guardian" });
  const a = childArgs(family, "Private creator child"), b = childArgs(second, "Private second child"), b2 = childArgs(second, "Second sibling"), e = childArgs(fourth, "Extra child");
  for (const [person, args] of [[creator, a], [other, b], [other, b2], [extra, e]]) await ok(person.db, "save_own_child", args);
  const duplicateChild = await Promise.all([creator.db.rpc("save_own_child", a), creator.db.rpc("save_own_child", a)]); duplicateChild.forEach((r) => assert.ifError(r.error));
  assert.equal((await creator.db.from("children").select("id").eq("id", a.p_id)).data.length, 1);
  await denied(other.db, "save_own_child", { ...a, p_family_id: second, p_revision: 1 }, "PT404");
  await denied(other.db, "save_own_child", { ...a, p_revision: 1 }, "PT404");
  await ok(creator.db, "save_own_child", { ...a, p_revision: 1, p_display_name: "Updated own child" });
  await denied(creator.db, "save_own_child", { ...a, p_revision: 1 }, "PT409");
  const args = rideArgs(family, circle, a.p_id, [second, fourth]);
  const anon = client();
  for (const invalid of [
    { p_child_ids: [] }, { p_child_ids: [b.p_id] }, { p_child_ids: [a.p_id, a.p_id] },
    { p_invited_family_ids: [outside] }, { p_invited_family_ids: [second, second] }, { p_invited_family_ids: [null] },
    { p_ends_at: args.p_starts_at }, { p_starts_at: "infinity" }, { p_timezone: "MST" }, { p_timezone: "Bogus/Zone" }, { p_pickup: args.p_destination },
  ]) await denied(creator.db, "create_ride", { ...args, ...invalid }, "PT400");
  await denied(unrelated.db, "create_ride", { ...args, p_family_id: outside }, "PT404");
  const creation = await Promise.all([creator.db.rpc("create_ride", args), creator.db.rpc("create_ride", args)]); creation.forEach((r) => assert.ifError(r.error));
  assert.equal(creation[0].data, creation[1].data);
  const ride = args.p_id;
  const session = (await creator.db.auth.getSession()).data.session;
  const zonedRetry = await fetch(`${status.API_URL}/rest/v1/rpc/create_ride`, {
    method: "POST", headers: { apikey: status.PUBLISHABLE_KEY || status.ANON_KEY, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json", Prefer: "timezone=Asia/Tokyo" }, body: JSON.stringify(args),
  });
  assert.equal(zonedRetry.status, 200);
  assert.match(zonedRetry.headers.get("preference-applied"), /timezone=Asia\/Tokyo/);
  assert.equal(await zonedRetry.json(), ride, "Creation digest is independent of the database session timezone");
  await denied(creator.db, "create_ride", { ...args, p_pickup: "Changed private address" }, "PT409");
  await denied(creator.db, "create_ride", { ...args, p_created_by: other.id });
  const summary = (await ok(other.db, "ride_offer", { p_id: ride }))[0];
  assert.equal(summary.status, "invited");
  assert.deepEqual(Object.keys(summary).sort(), ["id", "family_id", "circle_id", "pickup_summary", "destination_summary", "direction", "starts_at", "ends_at", "timezone", "revision", "cancelled_at", "status", "can_cancel"].sort());
  assert.equal((await other.db.from("ride_families").select("*").eq("ride_id", ride)).data.length, 1);
  for (const person of [other, coordinator, unrelated]) {
    for (const table of ["rides", "ride_riders", "ride_locations"]) {
      const rows = await person.db.from(table).select("*").eq(table === "rides" ? "id" : "ride_id", ride); assert.ifError(rows.error); assert.deepEqual(rows.data, [], `${table} private before joining`);
    }
    assert.deepEqual((await person.db.from("children").select("*").eq("family_id", family)).data, []);
  }
  assert.deepEqual(await ok(coordinator.db, "ride_offer", { p_id: ride }), [], "Coordinator has no ride directory");
  const tables = ["children", "rides", "ride_families", "ride_riders", "ride_locations"];
  for (const table of tables) {
    assert.ok((await anon.from(table).select("*")).error);
    for (const db of [creator.db, other.db, unrelated.db]) {
      assert.equal((await db.from(table).insert({})).error?.code, "42501");
      const key = table === "children" || table === "rides" ? "id" : "ride_id";
      assert.equal((await db.from(table).update({ [key]: crypto.randomUUID() }).eq(key, ride)).error?.code, "42501");
      assert.equal((await db.from(table).delete().eq(key, ride)).error?.code, "42501");
    }
  }
  const respond = { p_ride_id: ride, p_family_id: second, p_revision: 1, p_accept: true, p_child_ids: [b.p_id] };
  await denied(other.db, "respond_to_ride_invitation", { ...respond, p_child_ids: [a.p_id] }, "PT400");
  await denied(other.db, "respond_to_ride_invitation", { ...respond, p_child_ids: [b.p_id, b.p_id] }, "PT400");
  await denied(other.db, "respond_to_ride_invitation", { ...respond, p_child_ids: [] }, "PT400");
  await denied(unrelated.db, "respond_to_ride_invitation", { ...respond, p_family_id: outside }, "PT404");
  await denied(coordinator.db, "respond_to_ride_invitation", { ...respond, p_family_id: third }, "PT404");
  await denied(other.db, "set_own_ride_riders", { p_ride_id: ride, p_family_id: second, p_revision: 1, p_child_ids: [b.p_id] }, "PT404");
  for (const person of [other, coordinator, unrelated, guardian]) await denied(person.db, "cancel_ride", { p_ride_id: ride, p_family_id: second, p_revision: 1 }, "PT404");
  const coGuardian = await user("creator-family-guardian");
  const creatorGuardianInvite = (await ok(creator.db, "create_invitation", { p_kind: "guardian", p_scope_id: family, p_email: coGuardian.email }))[0];
  await ok(coGuardian.db, "accept_invitation", { p_kind: "guardian", p_token: creatorGuardianInvite.token, p_display_name: "Creator family guardian" });
  await denied(coGuardian.db, "cancel_ride", { p_ride_id: ride, p_family_id: family, p_revision: 1 }, "PT404");
  const joined = await Promise.all([other.db.rpc("respond_to_ride_invitation", respond), guardian.db.rpc("respond_to_ride_invitation", respond)]);
  assert.equal(joined.filter((r) => !r.error).length, 1); assert.equal(joined.find((r) => r.error).error.code, "PT409");
  assert.equal((await other.db.from("ride_riders").select("*").eq("ride_id", ride).eq("child_id", b.p_id)).data.length, 1);
  assert.equal((await other.db.from("ride_locations").select("pickup").eq("ride_id", ride).single()).data.pickup, args.p_pickup);
  assert.deepEqual((await other.db.from("children").select("*").eq("id", a.p_id)).data, []);
  // Independently authenticated session sees the committed roster after reload/sign-in.
  const independent = client(); assert.ifError((await independent.auth.signInWithPassword({ email: other.email, password: other.password })).error);
  assert.equal((await independent.from("ride_riders").select("child_id").eq("ride_id", ride)).data.length, 2);
  const set = { p_ride_id: ride, p_family_id: second, p_revision: 2, p_child_ids: [b.p_id, b2.p_id] };
  const rosterRace = await Promise.all([other.db.rpc("set_own_ride_riders", set), guardian.db.rpc("set_own_ride_riders", { ...set, p_child_ids: [b2.p_id] })]);
  assert.equal(rosterRace.filter((r) => !r.error).length, 1); assert.equal(rosterRace.find((r) => r.error).error.code, "PT409");
  await denied(other.db, "set_own_ride_riders", { ...set, p_revision: 3, p_child_ids: [a.p_id] }, "PT400");
  await ok(other.db, "set_own_ride_riders", { ...set, p_revision: 3, p_child_ids: [] });
  assert.deepEqual((await other.db.from("ride_locations").select("*").eq("ride_id", ride)).data, []);
  assert.equal((await ok(other.db, "ride_offer", { p_id: ride }))[0].status, "withdrawn");
  await ok(other.db, "respond_to_ride_invitation", { ...respond, p_revision: 4, p_accept: false, p_child_ids: [] });
  await ok(other.db, "respond_to_ride_invitation", { ...respond, p_revision: 5 });
  // Two separate families compete on the same revision; exactly one can commit.
  const crossRace = await Promise.all([
    extra.db.rpc("respond_to_ride_invitation", { ...respond, p_revision: 6, p_family_id: fourth, p_child_ids: [e.p_id] }),
    other.db.rpc("set_own_ride_riders", { ...set, p_revision: 6 }),
  ]);
  assert.equal(crossRace.filter((r) => !r.error).length, 1); assert.equal(crossRace.find((r) => r.error).error.code, "PT409");
  // Real declarative composite FKs reject cross-family riders even for fixture SQL.
  assert.throws(() => sql(`insert into public.ride_riders(ride_id,family_id,child_id,display_name,seat_requirement) values('${ride}','${family}','${b.p_id}','Spoof','standard');`));
  const commands = {
    save_own_child: a, create_ride: args, respond_to_ride_invitation: respond,
    set_own_ride_riders: set, cancel_ride: { p_ride_id: ride, p_family_id: family, p_revision: 7 },
    ride_offer: { p_id: ride }, ride_offers: { p_from: "2027-01-01Z", p_until: "2028-01-01Z" },
  };
  for (const [name, params] of Object.entries(commands)) await denied(anon, name, params);
  await denied(other.db, "lock_own_ride", { p_ride: ride, p_family: family });
  assert.ok((await other.db.schema("pool_private").rpc("create_ride", args)).error);
  const range = await ok(creator.db, "ride_offers", { p_from: "2027-11-07T07:00:00Z", p_until: "2027-11-07T08:00:00Z" }); assert.equal(range.length, 1);
  assert.equal((await ok(creator.db, "ride_offers", { p_from: args.p_ends_at, p_until: "2027-11-08T00:00:00Z" })).length, 0, "Half-open interval excludes completed interval at end boundary");
  await denied(creator.db, "ride_offers", { p_from: "2028-01-01Z", p_until: "2027-01-01Z" }, "PT400");
  await ok(other.db, "remove_family_member", { p_family_id: second, p_user_id: guardian.id });
  for (const table of tables) assert.deepEqual((await guardian.db.from(table).select("*")).data, [], `Removed guardian loses ${table}`);
  await denied(guardian.db, "respond_to_ride_invitation", { ...respond, p_revision: 7 }, "PT404");
  await ok(coordinator.db, "remove_circle_family", { p_circle_id: circle, p_family_id: second });
  for (const table of ["rides", "ride_locations", "ride_riders"]) assert.deepEqual((await other.db.from(table).select("*").eq(table === "rides" ? "id" : "ride_id", ride)).data, []);
  assert.deepEqual(await ok(other.db, "ride_offer", { p_id: ride }), []);
  await denied(other.db, "set_own_ride_riders", { ...set, p_revision: 7 }, "PT404");
  const cancel = { p_ride_id: ride, p_family_id: family, p_revision: 7 };
  const cancelRace = await Promise.all([creator.db.rpc("cancel_ride", cancel), creator.db.rpc("set_own_ride_riders", { ...cancel, p_child_ids: [a.p_id] })]);
  assert.equal(cancelRace.filter((r) => !r.error).length, 1); assert.equal(cancelRace.find((r) => r.error).error.code, "PT409");
  if (cancelRace[0].error) await ok(creator.db, "cancel_ride", { ...cancel, p_revision: 8 });
  const cancelled = (await ok(creator.db, "ride_offer", { p_id: ride }))[0]; assert.ok(cancelled.cancelled_at);
  await denied(creator.db, "cancel_ride", { ...cancel, p_revision: cancelled.revision }, "PT409");
  await denied(extra.db, "respond_to_ride_invitation", { ...respond, p_family_id: fourth, p_child_ids: [e.p_id], p_revision: cancelled.revision }, "PT409");
  // A duplicate creation request cannot revive cancellation. Removal made an
  // invited family inactive, so use a fresh no-invite ride to prove retry semantics.
  const retry = rideArgs(family, circle, a.p_id); await ok(creator.db, "create_ride", retry);
  await ok(creator.db, "cancel_ride", { p_ride_id: retry.p_id, p_family_id: family, p_revision: 1 });
  await ok(creator.db, "create_ride", retry); assert.ok((await ok(creator.db, "ride_offer", { p_id: retry.p_id }))[0].cancelled_at);
  console.log("R4 real-session checks passed: enrollment authority, summaries/locations/children, duplicates, independent persistence, revisions, concurrency, removal and cancellation.");
}
