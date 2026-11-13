import assert from "node:assert/strict";
import { setup } from "./handoff-permissions.mjs";

async function rpc(db, name, args, deniedCode) {
  const result = await db.rpc(name, args);
  if (deniedCode) assert.equal(result.error?.code, deniedCode, name);
  else assert.ifError(result.error);
  return result.data;
}

const saveArgs = (label, seats = 3) => ({
  p_id: crypto.randomUUID(),
  p_label: label,
  p_passenger_seats: seats,
  p_version: 0,
  p_retire: false,
});

export async function familyVehiclePermissionTests(status, sql) {
  const { a, b, d, out, bGuardian, driverGuardian, children, car, proposed, confirmed, anon } =
    await setup(status);
  const check = (db, family, code) =>
    rpc(db, "family_has_active_vehicle", { p_family_id: family }, code);
  assert.equal(await check(b.db, b.family), false);
  assert.equal(await check(bGuardian.db, b.family), false);
  await check(anon, b.family, "42501");
  await check(out.db, b.family, "PT404");
  await check(a.db, b.family, "PT404");
  await check(b.db, crypto.randomUUID(), "PT404");

  const guardianCar = saveArgs("Guardian car");
  await rpc(bGuardian.db, "save_vehicle", guardianCar);
  assert.equal(await check(b.db, b.family), true);
  const own = await b.db.from("vehicles").select("id");
  assert.ifError(own.error);
  assert.deepEqual(own.data, []);
  await rpc(b.db, "save_vehicle", { ...guardianCar, p_version: 1 }, "PT404");
  await rpc(bGuardian.db, "save_vehicle", {
    ...guardianCar, p_version: 1, p_retire: true,
  });
  assert.equal(await check(b.db, b.family), false);
  await rpc(bGuardian.db, "save_vehicle", { ...guardianCar, p_version: 2 });
  assert.equal(await check(b.db, b.family), true);
  await rpc(b.db, "remove_family_member", {
    p_family_id: b.family, p_user_id: bGuardian.id,
  });
  assert.equal(await check(b.db, b.family), false);
  await check(bGuardian.db, b.family, "PT404");
  const departedCar = await bGuardian.db.from("vehicles").select("id,retired_at").single();
  assert.ifError(departedCar.error);
  assert.deepEqual(departedCar.data, { id: guardianCar.p_id, retired_at: null });

  const [alternate, third, small, foreign, retired] = await Promise.all([
    rpc(d.db, "save_vehicle", saveArgs("Alternate van")),
    rpc(d.db, "save_vehicle", saveArgs("Third van")),
    rpc(d.db, "save_vehicle", saveArgs("Small car", 1)),
    rpc(driverGuardian.db, "save_vehicle", saveArgs("Other driver van")),
    (async () => {
      const args = saveArgs("Retired van");
      await rpc(d.db, "save_vehicle", args);
      return rpc(d.db, "save_vehicle", { ...args, p_version: 1, p_retire: true });
    })(),
  ]);
  const rideStatus = async (ride, db = a.db) =>
    (await rpc(db, "driver_status", { p_ride_id: ride.ride }))[0];
  const changeArgs = (source, vehicleId) => ({
    p_id: crypto.randomUUID(),
    p_proposal_id: source.proposal_id,
    p_revision: source.ride_revision,
    p_vehicle_id: vehicleId,
    p_vehicle_version: 1,
  });
  const change = (args, code, db = d.db) =>
    rpc(db, "request_ride_vehicle_change", args, code);
  const reply = (args) => ({ p_id: args.p_id, p_revision: args.p_revision });
  const approve = (args, guardian, child) => rpc(guardian.db, "consent_for_own_children", {
    ...reply(args), p_family_id: guardian.family, p_child_ids: [child],
  });
  const accept = (args) => rpc(d.db, "accept_driver_proposal", {
    ...reply(args), p_available_seats: 3, p_restraints: true,
  });
  const activeCar = (ride) => sql(
    `select vehicle_id from public.driver_assignments where ride_id = '${ride.ride}' and released_at is null`,
  );

  const pending = await proposed();
  await rpc(d.db, "accept_driver_proposal", {
    ...pending.reply, p_available_seats: 3, p_restraints: true,
  });
  await rpc(a.db, "consent_for_own_children", {
    ...pending.reply, p_family_id: a.family, p_child_ids: [children[0]],
  });
  const source = await rideStatus(pending, d.db);
  assert.equal(source.proposal_status, "pending");
  assert.equal(source.consent_count, 1);
  assert.ok(source.accepted_at);
  const request = changeArgs(source, alternate);
  await change(request, "42501", anon);
  await change(request, "PT404", a.db);
  await change(request, "PT404", driverGuardian.db);
  await change({ ...request, p_vehicle_id: foreign }, "PT404");
  await change({ ...request, p_vehicle_id: retired, p_vehicle_version: 2 }, "PT404");
  await change({ ...request, p_vehicle_id: small }, "PT422");
  await change({ ...request, p_vehicle_id: car }, "PT400");
  await change({ ...request, p_vehicle_version: 2 }, "PT409");
  assert.equal((await rideStatus(pending)).proposal_id, source.proposal_id);
  const retries = await Promise.all([change(request), change(request)]);
  assert.deepEqual(retries, [request.p_id, request.p_id]);
  await change({ ...request, p_id: crypto.randomUUID() }, "PT409");
  await change({ ...request, p_vehicle_id: third }, "PT409");
  const pendingChange = await rideStatus(pending, d.db);
  assert.equal(pendingChange.proposal_id, request.p_id);
  assert.equal(pendingChange.vehicle_id, alternate);
  assert.equal(pendingChange.deadline, source.deadline);
  assert.equal(pendingChange.accepted_at, null);
  assert.equal(pendingChange.consent_count, 0);
  assert.equal(activeCar(pending), "");
  await rpc(b.db, "consent_for_own_children", {
    ...pending.reply, p_family_id: b.family, p_child_ids: [children[1]],
  }, "PT409");
  await approve(request, b, children[1]);
  await approve(request, a, children[0]);
  assert.equal(activeCar(pending), "");
  await rpc(d.db, "accept_driver_proposal", {
    ...reply(request), p_available_seats: 3, p_restraints: false,
  }, "PT422");
  assert.equal(await accept(request), "confirmed");
  assert.equal(activeCar(pending), alternate);

  const ride = await confirmed();
  const original = await rideStatus(ride, d.db);
  const competing = await rpc(a.db, "request_replacement", {
    p_id: crypto.randomUUID(), p_ride_id: ride.ride, p_family_id: a.family,
    p_revision: ride.revision, p_driver_id: driverGuardian.id, p_driver_family_id: d.family,
    p_vehicle_id: foreign, p_vehicle_version: 1, p_mode: "optional_swap",
    p_original_assignment_id: original.current_assignment_id,
    p_original_assignment_revision: original.current_assignment_revision,
    p_deadline: original.starts_at,
  });
  await change(changeArgs(original, alternate), "PT409");
  await rpc(driverGuardian.db, "decline_driver_proposal", { p_id: competing, p_revision: ride.revision });

  const declined = changeArgs(original, alternate);
  await change(declined);
  assert.equal(activeCar(ride), car);
  await rpc(d.db, "decline_driver_proposal", reply(declined));
  assert.equal(activeCar(ride), car);
  const expired = changeArgs(original, alternate);
  await change(expired);
  sql(`update public.driver_proposals set deadline = clock_timestamp() - interval '1 second' where id = '${expired.p_id}'`);
  await change(changeArgs(await rideStatus(ride), third), "PT410");
  assert.equal(activeCar(ride), car);

  const second = changeArgs(original, alternate);
  await change(second);
  await accept(second);
  const thirdRequest = changeArgs(await rideStatus(ride), third);
  await change(thirdRequest);
  assert.equal((await rideStatus(ride)).accepted_at, null);
  assert.equal((await rideStatus(ride)).consent_count, 0);
  assert.equal(activeCar(ride), car);
  await approve(thirdRequest, a, children[0]);
  await accept(thirdRequest);
  assert.equal(activeCar(ride), car);
  assert.equal(await approve(thirdRequest, b, children[1]), "confirmed");
  assert.equal(activeCar(ride), third);
  assert.equal((await rideStatus(ride)).current_driver_name, original.current_driver_name);

  const late = await confirmed();
  const lateSource = await rideStatus(late);
  sql(`begin; set local session_replication_role = replica;
    update public.rides set starts_at = clock_timestamp() - interval '1 second' where id = '${late.ride}'; commit;`);
  await change(changeArgs(lateSource, alternate), "PT410");

  const pickedUp = await confirmed({ two: false });
  const beforePickup = await rideStatus(pickedUp);
  await rpc(a.db, "designate_recipient", {
    p_ride_id: pickedUp.ride, p_child_id: children[0], p_recipient_id: a.id,
    p_revision: pickedUp.revision, p_version: 0,
  });
  await rpc(d.db, "record_pickup", {
    p_request_id: crypto.randomUUID(), p_ride_id: pickedUp.ride,
    p_child_id: children[0], p_revision: pickedUp.revision, p_version: 1,
  });
  await change(changeArgs(beforePickup, alternate), "PT423");
  assert.equal(activeCar(pickedUp), car);
  console.log("Family vehicle availability and ride car change permissions passed.");
}
