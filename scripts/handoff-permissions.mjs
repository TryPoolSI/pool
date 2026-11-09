import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
const ok = async (db,name,args) => { const r=await db.rpc(name,args); assert.ifError(r.error); return r.data; };
const denied = async (db,name,args,code) => { const r=await db.rpc(name,args); assert.ok(r.error,`${name} must deny`); if(code) assert.equal(r.error.code,code,`${name}: ${r.error.message}`); };
export async function setup(status) {
  assert.equal(status.API_URL,"http://127.0.0.1:55321");
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  const client=()=>createClient(status.API_URL,status.PUBLISHABLE_KEY||status.ANON_KEY,options);
  const admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,options);
  async function user(label) {
    const email=`r6-${label}-${crypto.randomUUID()}@example.test`,password=`Pool-${crypto.randomUUID()}!`;
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(created.error);
    const db=client();assert.ifError((await db.auth.signInWithPassword({email,password})).error);
    const id=created.data.user.id;
    const family=await ok(db,"create_family",{p_name:`R6 ${label}`,p_display_name:`R6 ${label}`});
    return {db,id,email,family};
  }
  const [a,b,d,out,g]=await Promise.all(["guardian-a","guardian-b","driver","outsider","extra"].map(user));
  const circle=await ok(a.db,"create_circle",{p_family_id:a.family,p_name:"R6 handoffs"});
  for (const person of [b,d]) {
    const inv=(await ok(a.db,"create_invitation",{p_kind:"circle",p_scope_id:circle,p_email:person.email}))[0];
    await ok(person.db,"accept_invitation",{p_kind:"circle",p_token:inv.token,p_family_id:person.family,p_display_name:`R6 ${person===b?"guardian-b":"driver"}`});
  }
  for (const owner of [b,d]) {
    const inv=(await ok(owner.db,"create_invitation",{p_kind:"guardian",p_scope_id:owner.family,p_email:g.email}))[0];
    await ok(g.db,"accept_invitation",{p_kind:"guardian",p_token:inv.token,p_display_name:"R6 extra"});
  }
  const children=[];
  for (const parent of [a,b]) children.push(await ok(parent.db,"save_own_child",{p_id:crypto.randomUUID(),p_family_id:parent.family,p_display_name:`Child ${parent===a?"A":"B"}`,p_seat_requirement:"booster",p_revision:0}));
  const car=await ok(d.db,"save_vehicle",{p_id:crypto.randomUUID(),p_label:"R6 vehicle",p_passenger_seats:3,p_version:0,p_retire:false});
  let interval=0;
  async function confirmed({two=true,consenter=b,driver=d,driverFamily=d.family}={}) {
    const start=new Date(Date.UTC(2028,0,1,12+interval*2)).toISOString(),end=new Date(Date.UTC(2028,0,1,13+interval++*2)).toISOString();
    const ride=await ok(a.db,"create_ride",{p_id:crypto.randomUUID(),p_family_id:a.family,p_circle_id:circle,p_pickup_summary:"R6 pickup",p_destination_summary:"R6 drop-off",p_pickup:"R6 private start",p_destination:"R6 private end",p_direction:"outbound",p_starts_at:start,p_ends_at:end,p_timezone:"UTC",p_child_ids:[children[0]],p_invited_family_ids:two?[b.family]:[]});
    if(two) await ok(b.db,"respond_to_ride_invitation",{p_ride_id:ride,p_family_id:b.family,p_revision:1,p_accept:true,p_child_ids:[children[1]]});
    let vehicle=car;
    if(driver!==d) vehicle=await ok(driver.db,"save_vehicle",{p_id:crypto.randomUUID(),p_label:"Self car",p_passenger_seats:3,p_version:0,p_retire:false});
    const proposal=await ok(a.db,"propose_driver",{p_id:crypto.randomUUID(),p_ride_id:ride,p_family_id:a.family,p_revision:two?2:1,p_driver_id:driver.id,p_driver_family_id:driverFamily,p_vehicle_id:vehicle,p_vehicle_version:1});
    const revision=two?3:2,reply={p_id:proposal,p_revision:revision};
    await ok(driver.db,"accept_driver_proposal",{...reply,p_available_seats:3,p_restraints:true});
    await ok(a.db,"consent_for_own_children",{...reply,p_family_id:a.family,p_child_ids:[children[0]]});
    if(two) await ok(consenter.db,"consent_for_own_children",{...reply,p_family_id:b.family,p_child_ids:[children[1]]});
    return {ride,revision,reply,vehicle,driver,two};
  }
  return {a,b,d,out,g,children,car,circle,confirmed,anon:client()};
}
const designation=(r,child,recipient,version=0)=>({p_ride_id:r.ride,p_child_id:child,p_recipient_id:recipient,p_revision:r.revision,p_version:version});
const command=(r,child,version)=>({p_request_id:crypto.randomUUID(),p_ride_id:r.ride,p_child_id:child,p_revision:r.revision,p_version:version});
export async function handoffUpgradeIdentity(status) {
  const f=await setup(status),r=await f.confirmed();
  return async()=>{
    assert.equal((await ok(f.a.db,"driver_status",{p_ride_id:r.ride}))[0].coverage,"confirmed");
    assert.deepEqual((await f.a.db.from("ride_trips").select("*").eq("ride_id",r.ride)).data,[]);
    for (const [i,parent] of [[0,f.a],[1,f.b]]) await ok(parent.db,"designate_recipient",designation(r,f.children[i],parent.id));
    const firstPickup=command(r,f.children[0],1);
    await ok(f.d.db,"record_pickup",firstPickup);
    assert.equal((await f.b.db.from("ride_trips").select("*").eq("ride_id",r.ride)).data.length,1,"R5 confirmed plan survives upgrade and starts under R6");
    return async()=>{
      await denied(f.d.db,"record_pickup",{...command(r,f.children[1],1),p_request_id:firstPickup.p_request_id},"PT409");
      const duplicate={...firstPickup,p_request_id:crypto.randomUUID()};
      await ok(f.d.db,"record_pickup",duplicate);
      await denied(f.d.db,"record_pickup",{...command(r,f.children[1],1),p_request_id:duplicate.p_request_id},"PT409");
    };
  };
}
export async function handoffPermissionTests(status,sql) {
  const {a,b,d,out,g,children:[ca,cb],circle,car,confirmed,anon}=await setup(status);
  const r=await confirmed();
  const nextRide=await confirmed({two:false});
  await ok(a.db,"designate_recipient",designation(nextRide,ca,a.id));
  const da=designation(r,ca,a.id),db=designation(r,cb,b.id);
  await denied(out.db,"designate_recipient",da,"PT404");
  await denied(b.db,"designate_recipient",da,"PT404");
  await denied(a.db,"designate_recipient",{...da,p_recipient_id:d.id},"PT422");
  await denied(a.db,"designate_recipient",{...da,p_version:null},"PT400");
  assert.equal(await ok(a.db,"designate_recipient",da),1);assert.equal(await ok(a.db,"designate_recipient",da),1);
  await denied(a.db,"designate_recipient",{...da,p_version:99},"PT409");
  await denied(d.db,"record_pickup",command(r,ca,1),"PT422");
  assert.equal(sql(`select count(*) from public.ride_trips where ride_id='${r.ride}'`),"0","Missing recipient prevents every pickup and event");
  await ok(b.db,"designate_recipient",db);
  await denied(a.db,"confirm_handoff",command(r,ca,1),"PT409");
  await denied(d.db,"report_arrival",command(r,ca,1),"PT409");
  for(const actor of [a,b,g,out]) await denied(actor.db,"record_pickup",command(r,ca,1));
  for(const table of ["ride_handoffs","ride_trips","ride_events"]) {
    assert.deepEqual((await out.db.from(table).select("*").eq("ride_id",r.ride)).data,[]);
    const fabricated={
      ride_handoffs:{ride_id:r.ride,child_id:ca,family_id:a.family,recipient_id:a.id,recipient_name:"Forged",designated_by:a.id,status:"completed",picked_up_at:"2020-01-01Z",arrived_at:"2020-01-01Z",completed_at:"2020-01-01Z"},
      ride_trips:{ride_id:r.ride,assignment_id:crypto.randomUUID(),ride_revision:r.revision},
      ride_events:{request_id:crypto.randomUUID(),ride_id:r.ride,child_id:ca,kind:"completed",previous_version:1,actor_id:a.id,actor_name:"Forged",occurred_at:"2020-01-01Z"},
    };
    assert.equal((await a.db.from(table).insert(fabricated[table])).error?.code,"42501","Table grants prohibit well-shaped fabricated state/events");
    assert.equal((await d.db.from(table).update({ride_id:r.ride}).eq("ride_id",r.ride)).error?.code,"42501");
    assert.equal((await b.db.from(table).delete().eq("ride_id",r.ride)).error?.code,"42501");
  }
  // A failed event INSERT rolls back the first-pickup freeze and child update.
  sql(`create function pool_private.fail_r6_event() returns trigger language plpgsql as $$ begin raise exception 'test event failure'; end $$;
    create trigger test_event_failure before insert on public.ride_events for each row execute function pool_private.fail_r6_event();`);
  await denied(d.db,"record_pickup",command(r,ca,1));
  assert.equal(sql(`select count(*) from public.ride_trips where ride_id='${r.ride}'`),"0");
  assert.equal(sql(`select status from public.ride_handoffs where ride_id='${r.ride}' and child_id='${ca}'`),"scheduled");
  sql("drop trigger test_event_failure on public.ride_events; drop function pool_private.fail_r6_event();");
  const pickupA=command(r,ca,1);
  await denied(d.db,"record_pickup",{...pickupA,p_revision:r.revision-1},"PT409");
  assert.equal(await ok(d.db,"record_pickup",pickupA),"picked_up");
  assert.equal(await ok(d.db,"record_pickup",pickupA),"picked_up");
  const duplicatePickup={...pickupA,p_request_id:crypto.randomUUID()};
  await ok(d.db,"record_pickup",duplicatePickup);
  await denied(d.db,"record_pickup",{...command(r,cb,1),p_request_id:duplicatePickup.p_request_id},"PT409");
  assert.equal(sql(`select status from public.ride_handoffs where ride_id='${r.ride}' and child_id='${cb}'`),"scheduled");
  assert.equal(sql(`select count(*) from public.ride_events where ride_id='${r.ride}'`),"1","Successful duplicate UUID is bound without fabricating another event");
  assert.equal(sql(`select count(*) from public.ride_event_requests where ride_id='${r.ride}'`),"2");
  await denied(b.db,"set_own_ride_riders",{p_ride_id:r.ride,p_family_id:b.family,p_revision:r.revision,p_child_ids:[]},"PT423");
  await denied(b.db,"designate_recipient",{...db,p_version:1,p_recipient_id:g.id},"PT423");
  await denied(d.db,"record_pickup",command(nextRide,ca,1),"PT424");
  assert.equal(sql(`select count(*) from public.ride_trips where ride_id='${nextRide.ride}'`),"0","Adjacent planned interval cannot start while an actual trip is unfinished");
  const pickupB=command(r,cb,1);await ok(d.db,"record_pickup",pickupB);
  await denied(d.db,"report_arrival",{...command(r,cb,2),p_request_id:pickupA.p_request_id},"PT409");
  await denied(d.db,"report_arrival",command(r,ca,1),"PT409");
  await denied(b.db,"report_arrival",command(r,ca,2),"PT404");
  const arrivalA=command(r,ca,2),arrivalB=command(r,cb,2);
  await ok(d.db,"report_arrival",arrivalA);await ok(d.db,"report_arrival",arrivalB);
  const receiptA=command(r,ca,3),receiptB=command(r,cb,3);
  for (const actor of [d,b,g,out]) await denied(actor.db,"confirm_handoff",receiptA,"PT404");
  await denied(g.db,"confirm_handoff",receiptB,"PT404"); // Same-family guardian, not designated.
  const history=await a.db.from("ride_events").select("*").eq("ride_id",r.ride);assert.ifError(history.error);
  assert.equal(history.data.length,4);assert.ok(history.data.every(e=>e.actor_id===d.id && e.actor_name==="R6 driver" && Number.isFinite(Date.parse(e.occurred_at))));
  assert.deepEqual(await ok(out.db,"trip_attention",{}),[]);
  assert.ok((await ok(b.db,"trip_attention",{})).some(t=>t.ride_id===r.ride && t.awaiting_count===2));
  // Ordinary changes cannot erase responsibility, including a different child still scheduled.
  for (const [who,name,args] of [
    [a,"cancel_ride",{p_ride_id:r.ride,p_family_id:a.family,p_revision:r.revision}],
    [d,"withdraw_driver",r.reply],
    [b,"revoke_own_consent",{...r.reply,p_family_id:b.family,p_child_ids:[cb]}],
    [b,"set_own_ride_riders",{p_ride_id:r.ride,p_family_id:b.family,p_revision:r.revision,p_child_ids:[]}],
    [b,"designate_recipient",{...db,p_version:1,p_recipient_id:g.id}],
    [a,"remove_circle_family",{p_circle_id:circle,p_family_id:b.family}],
    [a,"remove_circle_family",{p_circle_id:circle,p_family_id:d.family}],
    [d,"save_vehicle",{p_id:car,p_label:"Changed",p_passenger_seats:3,p_version:1,p_retire:false}],
  ]) await denied(who.db,name,args,"PT423");
  const receipts=await Promise.all([a.db.rpc("confirm_handoff",receiptA),a.db.rpc("confirm_handoff",{...receiptA,p_request_id:crypto.randomUUID()})]);receipts.forEach(x=>assert.ifError(x.error));
  assert.equal(sql(`select count(*) from public.ride_events where ride_id='${r.ride}' and kind='completed'`),"1");
  assert.equal(sql(`select status from public.ride_handoffs where ride_id='${r.ride}' and child_id='${cb}'`),"awaiting_handoff");
  assert.equal(sql(`select completed_at is null from public.ride_trips where ride_id='${r.ride}'`),"t");
  await ok(b.db,"confirm_handoff",receiptB);
  assert.equal(sql(`select completed_at is not null from public.ride_trips where ride_id='${r.ride}'`),"t");
  assert.equal(sql(`select release_reason from public.driver_assignments where ride_id='${r.ride}'`),"completed");
  assert.equal((await ok(a.db,"driver_status",{p_ride_id:r.ride}))[0].coverage,"confirmed");
  assert.equal((await d.db.from("ride_events").select("*").eq("ride_id",r.ride)).data.length,6,"Current driver retains authorized completed history");
  assert.equal(await ok(d.db,"record_pickup",pickupA),"completed","Original event retry returns terminal state without writing");
  await ok(a.db,"confirm_handoff",receiptA);
  await denied(d.db,"record_pickup",command(r,ca,4),"PT409");
  await denied(d.db,"report_arrival",command(r,ca,4),"PT409");
  await denied(a.db,"confirm_handoff",command(r,ca,4),"PT409");
  await denied(a.db,"cancel_ride",{p_ride_id:r.ride,p_family_id:a.family,p_revision:r.revision},"PT423");
  assert.throws(()=>sql(`update public.ride_events set actor_name='Fabricated' where ride_id='${r.ride}'`));
  assert.throws(()=>sql(`delete from public.ride_events where ride_id='${r.ride}'`));
  assert.equal(sql(`select count(*) from public.ride_events where ride_id='${r.ride}'`),"6");
  assert.ok(!(await ok(a.db,"trip_attention",{})).some(t=>t.ride_id===r.ride));
  const sharedRequest=crypto.randomUUID();
  const bindingRace=await Promise.all([
    a.db.rpc("confirm_handoff",{...receiptA,p_request_id:sharedRequest}),
    d.db.rpc("record_pickup",{...command(nextRide,ca,1),p_request_id:sharedRequest}),
  ]);
  assert.equal(bindingRace.filter(x=>!x.error).length,1,"One UUID cannot acknowledge two different payloads");
  assert.equal(bindingRace.find(x=>x.error).error.code,"PT409");
  assert.equal(sql(`select count(*) from public.ride_event_requests where request_id='${sharedRequest}'`),"1");
  if(bindingRace[1].error) {
    assert.equal(sql(`select count(*) from public.ride_events where ride_id='${nextRide.ride}'`),"0","Binding conflict rolls back a newly inserted event");
    assert.equal(sql(`select count(*) from public.ride_trips where ride_id='${nextRide.ride}'`),"0","Binding conflict rolls back the trip freeze");
  }
  await ok(d.db,"record_pickup",command(nextRide,ca,1));
  const metadata={request_id:crypto.randomUUID(),event_id:pickupA.p_request_id,ride_id:r.ride,child_id:ca,kind:"picked_up",previous_version:1,actor_id:d.id};
  assert.equal((await d.db.from("ride_event_requests").insert(metadata)).error?.code,"42501");
  assert.equal((await a.db.from("ride_event_requests").select("*")).error?.code,"42501");
  assert.equal((await d.db.from("ride_event_requests").update({actor_id:a.id}).eq("ride_id",r.ride)).error?.code,"42501");
  assert.equal((await d.db.from("ride_event_requests").delete().eq("ride_id",r.ride)).error?.code,"42501");
  assert.throws(()=>sql(`update public.ride_event_requests set actor_id='${a.id}' where request_id='${pickupA.p_request_id}'`));
  assert.throws(()=>sql(`delete from public.ride_event_requests where request_id='${pickupA.p_request_id}'`));
  await ok(d.db,"report_arrival",command(nextRide,ca,2));
  await ok(a.db,"confirm_handoff",command(nextRide,ca,3));
  await ok(d.db,"save_vehicle",{p_id:car,p_label:"R6 vehicle",p_passenger_seats:3,p_version:1,p_retire:false});
  // Restore fixture version for subsequent confirmations; completed reservation is released.
  sql(`update public.vehicles set version=1 where id='${car}'`);
  const self=await confirmed({two:false,driver:a,driverFamily:a.family});
  await ok(a.db,"designate_recipient",designation(self,ca,a.id));
  await ok(a.db,"record_pickup",command(self,ca,1));
  await denied(a.db,"confirm_handoff",command(self,ca,2),"PT409");
  await ok(a.db,"report_arrival",command(self,ca,2));
  await ok(a.db,"confirm_handoff",command(self,ca,3));
  // Valid recipient, but privileged corruption of consent/vehicle/roster must still fail at pickup.
  for (const corruption of ["consent","capacity","roster","membership"]) {
    const x=await confirmed();
    await ok(a.db,"designate_recipient",designation(x,ca,a.id));await ok(b.db,"designate_recipient",designation(x,cb,b.id));
    if(corruption==="consent") sql(`update public.ride_driver_consents set revoked_at=clock_timestamp() where proposal_id='${x.reply.p_id}' and child_id='${cb}'`);
    if(corruption==="capacity") sql(`update public.vehicles set passenger_seats=1 where id='${car}'`);
    if(corruption==="roster") sql(`update public.driver_proposals set roster=roster || '[{"child":"00000000-0000-0000-0000-000000000000","family":"${a.family}","seat":"booster"}]'::jsonb where id='${x.reply.p_id}'`);
    if(corruption==="membership") sql(`alter table public.family_members disable trigger driver_guardian_removed; update public.family_members set removed_at=clock_timestamp() where family_id='${b.family}' and user_id='${b.id}'; alter table public.family_members enable trigger driver_guardian_removed;`);
    await denied(d.db,"record_pickup",command(x,ca,1));
    assert.equal(sql(`select count(*) from public.ride_events where ride_id='${x.ride}'`),"0");
    assert.equal(sql(`select count(*) from public.ride_trips where ride_id='${x.ride}'`),"0");
    if(corruption==="capacity") sql(`update public.vehicles set passenger_seats=3 where id='${car}'`);
    if(corruption==="membership") sql(`update public.family_members set removed_at=null where family_id='${b.family}' and user_id='${b.id}'`);
    await ok(d.db,"withdraw_driver",x.reply);
  }
  // Removing a designated recipient before pickup does not silently substitute
  // another guardian. R5 consent remains valid, but R6 must refuse start.
  const missing=await confirmed();
  await ok(a.db,"designate_recipient",designation(missing,ca,a.id));await ok(b.db,"designate_recipient",designation(missing,cb,g.id));
  await ok(b.db,"remove_family_member",{p_family_id:b.family,p_user_id:g.id});
  await denied(d.db,"record_pickup",command(missing,ca,1),"PT422");
  assert.equal(sql(`select count(*) from public.ride_trips where ride_id='${missing.ride}'`),"0");
  await ok(d.db,"withdraw_driver",missing.reply);
  async function restoreGuardian() {
    const inv=(await ok(b.db,"create_invitation",{p_kind:"guardian",p_scope_id:b.family,p_email:g.email}))[0];
    await ok(g.db,"accept_invitation",{p_kind:"guardian",p_token:inv.token,p_display_name:"R6 extra"});
  }
  await restoreGuardian();
  // Concurrent recipient removal/first pickup either preserves the membership
  // for the active trip or refuses pickup. There can be no orphaned handoff.
  const race=await confirmed();
  await ok(a.db,"designate_recipient",designation(race,ca,a.id));await ok(b.db,"designate_recipient",designation(race,cb,g.id));
  const raced=await Promise.all([b.db.rpc("remove_family_member",{p_family_id:b.family,p_user_id:g.id}),d.db.rpc("record_pickup",command(race,ca,1))]);
  assert.equal(raced.filter(x=>!x.error).length,1);
  if(!raced[1].error) {
    assert.equal(raced[0].error.code,"PT423");
    await ok(d.db,"record_pickup",command(race,cb,1));
    for(const child of [ca,cb]) await ok(d.db,"report_arrival",command(race,child,2));
    await ok(a.db,"confirm_handoff",command(race,ca,3));await ok(g.db,"confirm_handoff",command(race,cb,3));
  } else {
    assert.equal(raced[1].error.code,"PT422");
    assert.equal(sql(`select count(*) from public.ride_trips where ride_id='${race.ride}'`),"0");
    await restoreGuardian();await ok(d.db,"withdraw_driver",race.reply);
  }
  // A removable driver guardian is held to the same active-trip guard.
  const driverTrip=await confirmed({two:false,driver:g,driverFamily:d.family});
  await ok(a.db,"designate_recipient",designation(driverTrip,ca,a.id));await ok(g.db,"record_pickup",command(driverTrip,ca,1));
  await denied(d.db,"remove_family_member",{p_family_id:d.family,p_user_id:g.id},"PT423");
  await ok(g.db,"report_arrival",command(driverTrip,ca,2));await ok(a.db,"confirm_handoff",command(driverTrip,ca,3));
  await ok(d.db,"remove_family_member",{p_family_id:d.family,p_user_id:g.id});
  assert.deepEqual((await g.db.from("ride_events").select("*").eq("ride_id",driverTrip.ride)).data,[]);
  // Active recipients/consent grantors and the driver's explicit membership context
  // cannot be removed, even when all scheduled times are in the past.
  const active=await confirmed({consenter:g});
  await ok(a.db,"designate_recipient",designation(active,ca,a.id));await ok(b.db,"designate_recipient",designation(active,cb,g.id));
  sql(`alter table public.rides disable trigger driver_plan; update public.rides set starts_at='2020-01-01Z',ends_at='2020-01-02Z' where id='${active.ride}'; alter table public.rides enable trigger driver_plan;`);
  await ok(d.db,"record_pickup",command(active,ca,1));
  await denied(b.db,"remove_family_member",{p_family_id:b.family,p_user_id:g.id},"PT423");
  await denied(g.db,"remove_family_member",{p_family_id:b.family,p_user_id:g.id},"PT423");
  await denied(a.db,"remove_circle_family",{p_circle_id:circle,p_family_id:d.family},"PT423");
  assert.ok((await ok(g.db,"trip_attention",{})).some(t=>t.ride_id===active.ride));
  await ok(d.db,"record_pickup",command(active,cb,1));
  for(const child of [ca,cb]) await ok(d.db,"report_arrival",command(active,child,2));
  await ok(a.db,"confirm_handoff",command(active,ca,3));await ok(g.db,"confirm_handoff",command(active,cb,3));
  await ok(b.db,"remove_family_member",{p_family_id:b.family,p_user_id:g.id});
  assert.deepEqual((await g.db.from("ride_events").select("*").eq("ride_id",active.ride)).data,[],"Removal immediately revokes private history");
  // Future R5 coverage still invalidates on consent/membership changes.
  const future=await confirmed();
  await ok(a.db,"designate_recipient",designation(future,ca,a.id));await ok(b.db,"designate_recipient",designation(future,cb,b.id));
  await ok(b.db,"revoke_own_consent",{...future.reply,p_family_id:b.family,p_child_ids:[cb]});
  await denied(d.db,"record_pickup",command(future,ca,1));
  const removed=await confirmed();
  await ok(a.db,"designate_recipient",designation(removed,ca,a.id));await ok(b.db,"designate_recipient",designation(removed,cb,b.id));
  await ok(a.db,"remove_circle_family",{p_circle_id:circle,p_family_id:b.family});
  assert.equal((await ok(a.db,"driver_status",{p_ride_id:removed.ride}))[0].coverage,"needs_driver");
  await denied(d.db,"record_pickup",command(removed,ca,1));
  for(const name of ["record_pickup","report_arrival","confirm_handoff"]) await denied(anon,name,command(r,ca,1));
  await denied(anon,"designate_recipient",da);await denied(anon,"trip_attention",{});
  await denied(a.db,"transition_child",{...command(r,ca,1),p_kind:"completed"});
  assert.ok((await a.db.schema("pool_private").rpc("start_trip",{p_ride:r.ride})).error);
  console.log("R6 real-session checks passed: multi-child handoffs, recipient/actor authority, atomic idempotent events, privacy, first-pickup revalidation, active-trip guards and terminal protection.");
}
