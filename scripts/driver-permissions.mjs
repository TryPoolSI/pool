import assert from "node:assert/strict";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
function fixtures(status) {
  assert.equal(status.API_URL,"http://127.0.0.1:55321");
  const options = { auth:{ persistSession:false,autoRefreshToken:false } };
  const client = () => createClient(status.API_URL,status.PUBLISHABLE_KEY || status.ANON_KEY,options);
  const admin = createClient(status.API_URL,status.SERVICE_ROLE_KEY,options);
  async function user(label) {
    const email=`r5-${label}-${crypto.randomUUID()}@example.test`,password=`Pool-${crypto.randomUUID()}!`;
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true}); assert.ifError(created.error);
    const db=client(); assert.ifError((await db.auth.signInWithPassword({email,password})).error);
    return {db,id:created.data.user.id,email};
  }
  return {client,user};
}
async function ok(db,name,args) { const r=await db.rpc(name,args); assert.ifError(r.error); return r.data; }
async function denied(db,name,args,code) { const r=await db.rpc(name,args); assert.ok(r.error,`${name} must deny`); if(code) assert.equal(r.error.code,code,`${name}: ${r.error.message}`); }
const childArgs=(family,name)=>({p_id:crypto.randomUUID(),p_family_id:family,p_display_name:name,p_seat_requirement:"booster",p_revision:0});
const vehicleArgs=(seats=4)=>({p_id:crypto.randomUUID(),p_label:"Registered car",p_passenger_seats:seats,p_version:0,p_retire:false});
const rideArgs=(family,circle,children,invited=[])=>({p_id:crypto.randomUUID(),p_family_id:family,p_circle_id:circle,p_pickup_summary:"Neighborhood",p_destination_summary:"Activity",p_pickup:"101 Secret Place",p_destination:"202 Private Destination",p_direction:"outbound",p_starts_at:"2027-11-07T07:30Z",p_ends_at:"2027-11-07T09:30Z",p_timezone:"America/Denver",p_child_ids:children,p_invited_family_ids:invited});
export async function driverUpgradeIdentity(status) {
  const person=await fixtures(status).user("r4-upgrade");
  const family=await ok(person.db,"create_family",{p_name:"Persisted R4 family",p_display_name:"Existing guardian"});
  const circle=await ok(person.db,"create_circle",{p_family_id:family,p_name:"Persisted R4 circle"});
  const child=await ok(person.db,"save_own_child",childArgs(family,"Existing enrolled child"));
  const ride=await ok(person.db,"create_ride",rideArgs(family,circle,[child]));
  return async()=>{
    const vehicle=await ok(person.db,"save_vehicle",vehicleArgs());
    const proposal=await ok(person.db,"propose_driver",{p_id:crypto.randomUUID(),p_ride_id:ride,p_family_id:family,p_revision:1,p_driver_id:person.id,p_driver_family_id:family,p_vehicle_id:vehicle,p_vehicle_version:1});
    const reply={p_id:proposal,p_revision:2};
    assert.equal(await ok(person.db,"accept_driver_proposal",{...reply,p_available_seats:4,p_restraints:true}),"awaiting_confirmation");
    assert.equal(await ok(person.db,"consent_for_own_children",{...reply,p_family_id:family,p_child_ids:[child]}),"confirmed");
  };
}
export async function driverPermissionTests(status,sql) {
  const {client,user}=fixtures(status);
  const [a,b,d,outsider,g,spare]=await Promise.all(["a","b","driver","outsider","guardian","spare"].map(user));
  const fa=await ok(a.db,"create_family",{p_name:"Family A",p_display_name:"Guardian A"});
  const fb=await ok(b.db,"create_family",{p_name:"Family B",p_display_name:"Guardian B"});
  const fd=await ok(d.db,"create_family",{p_name:"Driver family",p_display_name:"Driver D"});
  const fout=await ok(outsider.db,"create_family",{p_name:"Outside family",p_display_name:"Outside"});
  const circle=await ok(a.db,"create_circle",{p_family_id:fa,p_name:"R5 circle"});
  for(const [person,family] of [[b,fb],[d,fd]]) {
    const inv=(await ok(a.db,"create_invitation",{p_kind:"circle",p_scope_id:circle,p_email:person.email}))[0];
    await ok(person.db,"accept_invitation",{p_kind:"circle",p_token:inv.token,p_family_id:family,p_display_name:"Adult"});
  }
  for(const [person,family] of [[g,fb],[spare,fd]]) {
    const owner=family===fb?b:d;
    const inv=(await ok(owner.db,"create_invitation",{p_kind:"guardian",p_scope_id:family,p_email:person.email}))[0];
    await ok(person.db,"accept_invitation",{p_kind:"guardian",p_token:inv.token,p_display_name:"Additional guardian"});
  }
  const ca=await ok(a.db,"save_own_child",childArgs(fa,"Private A child"));
  const cb=await ok(b.db,"save_own_child",childArgs(fb,"Private B child"));
  const cb2=await ok(b.db,"save_own_child",childArgs(fb,"Private B sibling"));
  const carArgs=vehicleArgs(), car=await ok(d.db,"save_vehicle",carArgs);
  const small=await ok(d.db,"save_vehicle",vehicleArgs(1));
  const secondCar=await ok(d.db,"save_vehicle",vehicleArgs(4));
  const ownCar=await ok(a.db,"save_vehicle",vehicleArgs(4));
  const ownedVehicles=await d.db.from("vehicles").select("id");assert.ifError(ownedVehicles.error);assert.equal(ownedVehicles.data.length,3);
  const otherVehicles=await a.db.from("vehicles").select("id");assert.ifError(otherVehicles.error);assert.deepEqual(otherVehicles.data.map(v=>v.id),[ownCar]);
  await ok(d.db,"save_vehicle",carArgs); // identical create retry
  for(const seats of [0,-1,51,1.5]) await denied(d.db,"save_vehicle",{...vehicleArgs(),p_passenger_seats:seats});
  await denied(a.db,"save_vehicle",{...carArgs,p_version:1},"PT404");
  await denied(d.db,"save_vehicle",{...carArgs,p_version:2},"PT409");
  async function make({two=true,start="2027-11-07T07:30Z",end="2027-11-07T09:30Z",respond=true}={}) {
    const ride=await ok(a.db,"create_ride",{...rideArgs(fa,circle,[ca],two?[fb]:[]),p_starts_at:start,p_ends_at:end});
    if(two&&respond) await ok(b.db,"respond_to_ride_invitation",{p_ride_id:ride,p_family_id:fb,p_revision:1,p_accept:true,p_child_ids:[cb,cb2]});
    return {ride,revision:two&&respond?2:1};
  }
  function nomination(r,changes={}) {return {p_id:crypto.randomUUID(),p_ride_id:r.ride,p_family_id:fa,p_revision:r.revision,p_driver_id:d.id,p_driver_family_id:fd,p_vehicle_id:car,p_vehicle_version:1,...changes};}
  async function propose(r,changes={}) { const args=nomination(r,changes); const id=await ok(a.db,"propose_driver",args); return {p_id:id,p_revision:r.revision+1}; }
  async function state(r,db=a.db) {return (await ok(db,"driver_status",{p_ride_id:r.ride}))[0];}
  const notReady=await make({respond:false});
  await denied(a.db,"propose_driver",nomination(notReady),"PT422");
  await ok(b.db,"respond_to_ride_invitation",{p_ride_id:notReady.ride,p_family_id:fb,p_revision:1,p_accept:false,p_child_ids:[]});
  notReady.revision=2;const declinedFamily=await propose(notReady);
  assert.equal((await state(notReady)).rider_count,1,"Declined family contributes no riders");
  await ok(d.db,"decline_driver_proposal",declinedFamily);
  const r=await make();
  for(const change of [{p_vehicle_id:ownCar},{p_vehicle_version:2},{p_driver_id:outsider.id},{p_vehicle_id:small}]) await denied(a.db,"propose_driver",nomination(r,change));
  await denied(outsider.db,"propose_driver",nomination(r),"PT404");
  const args=nomination(r);
  const competing=await Promise.all([a.db.rpc("propose_driver",args),a.db.rpc("propose_driver",nomination(r))]);
  assert.equal(competing.filter(x=>!x.error).length,1);
  const p={p_id:competing.find(x=>!x.error).data,p_revision:r.revision+1};
  const winnerArgs=competing[0].error?undefined:args;
  if(winnerArgs) assert.equal(await ok(a.db,"propose_driver",winnerArgs),p.p_id);
  const anon=client();
  for(const table of ["vehicles","driver_proposals","ride_driver_consents","driver_assignments"]) {
    assert.ok((await anon.from(table).select("*")).error);
    for(const db of [a.db,d.db,outsider.db]) {
      assert.equal((await db.from(table).insert({})).error?.code,"42501");
      const key=table==="ride_driver_consents"?"proposal_id":"id";
      assert.equal((await db.from(table).update({[key]:crypto.randomUUID()}).eq(key,p.p_id)).error?.code,"42501");
      assert.equal((await db.from(table).delete().eq(key,p.p_id)).error?.code,"42501");
    }
  }
  for(const person of [d,outsider]) {
    for(const table of ["rides","ride_locations","ride_riders","driver_proposals"]) assert.deepEqual((await person.db.from(table).select("*").eq(table==="rides"?"id":"ride_id",r.ride)).data,[],`${table} hidden from proposed-only/unrelated`);
    assert.deepEqual((await person.db.from("children").select("*").eq("family_id",fa)).data,[]);
  }
  assert.deepEqual(await ok(outsider.db,"driver_status",{p_ride_id:r.ride}),[]);
  assert.deepEqual(await ok(outsider.db,"driver_options",{p_ride_id:r.ride}),[]);
  const minimal=await state(r,d.db);
  assert.equal(minimal.rider_count,3);assert.equal(minimal.booster_count,3);
  assert.ok(!JSON.stringify(minimal).includes(ca));assert.ok(!JSON.stringify(minimal).includes("Secret Place"));
  await denied(a.db,"accept_driver_proposal",{...p,p_available_seats:4,p_restraints:true},"PT404");
  await denied(d.db,"accept_driver_proposal",{...p,p_available_seats:2,p_restraints:true},"PT422");
  await denied(d.db,"accept_driver_proposal",{...p,p_available_seats:5,p_restraints:true},"PT422");
  await denied(d.db,"accept_driver_proposal",{...p,p_available_seats:4,p_restraints:false},"PT422");
  await denied(d.db,"accept_driver_proposal",{...p,p_revision:p.p_revision-1,p_available_seats:4,p_restraints:true},"PT409");
  await denied(b.db,"consent_for_own_children",{...p,p_family_id:fa,p_child_ids:[ca]},"PT404");
  await denied(b.db,"consent_for_own_children",{...p,p_family_id:fb,p_child_ids:[ca]},"PT400");
  await denied(d.db,"consent_for_own_children",{...p,p_family_id:fd,p_child_ids:[ca]},"PT404");
  await denied(b.db,"consent_for_own_children",{...p,p_family_id:fb,p_child_ids:[cb,cb]},"PT400");
  await denied(a.db,"set_own_ride_riders",{p_ride_id:r.ride,p_family_id:fa,p_revision:p.p_revision,p_child_ids:[ca]},"PT423");
  await denied(d.db,"save_vehicle",{...carArgs,p_version:1,p_passenger_seats:3},"PT423");
  await denied(d.db,"save_vehicle",{...carArgs,p_version:1,p_retire:true},"PT423");
  assert.equal(await ok(d.db,"accept_driver_proposal",{...p,p_available_seats:4,p_restraints:true}),"awaiting_confirmation");
  await ok(a.db,"consent_for_own_children",{...p,p_family_id:fa,p_child_ids:[ca]});
  await ok(b.db,"consent_for_own_children",{...p,p_family_id:fb,p_child_ids:[cb]});
  assert.equal((await state(r)).coverage,"awaiting_confirmation","One missing child consent prevents confirmation");
  const last={...p,p_family_id:fb,p_child_ids:[cb2]};
  const final=await Promise.all([b.db.rpc("consent_for_own_children",last),g.db.rpc("consent_for_own_children",last),d.db.rpc("accept_driver_proposal",{...p,p_available_seats:4,p_restraints:true})]);
  final.forEach(x=>assert.ifError(x.error));
  assert.equal(final[0].data,"confirmed");assert.equal(final[1].data,"confirmed");assert.ok(["awaiting_confirmation","confirmed"].includes(final[2].data));
  assert.equal(sql(`select count(*) from public.driver_assignments where ride_id='${r.ride}' and released_at is null`),"1");
  assert.equal((await d.db.from("ride_locations").select("*").eq("ride_id",r.ride)).data.length,1);
  assert.deepEqual((await d.db.from("children").select("*").eq("family_id",fa)).data,[]);
  const driverAssignments=await d.db.from("driver_assignments").select("*").eq("ride_id",r.ride);assert.ifError(driverAssignments.error);assert.equal(driverAssignments.data.length,1);
  assert.deepEqual((await d.db.from("driver_proposals").select("*").eq("ride_id",r.ride)).data,[],"Confirmed driver uses projection, not historical roster snapshots");
  // More history than the Data API's max_rows must not hide current coverage.
  // Bulk closed fixtures are setup only; every read assertion uses real sessions.
  sql(`with history as (
    insert into public.rides(id,circle_id,creator_family_id,created_by,pickup_summary,destination_summary,direction,starts_at,ends_at,timezone,revision,creation_digest)
      select gen_random_uuid(),'${circle}','${fa}','${a.id}','Historic area','Historic activity','outbound',
        '2021-01-01Z'::timestamptz+n*interval '1 hour','2021-01-01Z'::timestamptz+(n+1)*interval '1 hour','UTC',2,extensions.digest(n::text,'sha256') from generate_series(1,1005) n returning id,starts_at
  ), participants as (
    insert into public.ride_families(ride_id,circle_id,family_id,status,responded_at) select id,'${circle}','${fa}','joined',clock_timestamp() from history returning ride_id
  ) insert into public.driver_proposals(id,ride_id,ride_revision,nominated_by,nominating_family_id,driver_id,driver_family_id,vehicle_id,vehicle_version,roster,deadline,status,closed_at)
    select gen_random_uuid(),h.id,2,'${a.id}','${fa}','${d.id}','${fd}','${car}',1,
      jsonb_build_array(jsonb_build_object('child','${ca}','family','${fa}','seat','booster')),h.starts_at,'cancelled',clock_timestamp() from history h join participants rf on rf.ride_id=h.id`);
  const exactStatuses=await ok(a.db,"driver_statuses",{p_ride_ids:[r.ride]});assert.equal(exactStatuses[0].coverage,"confirmed");
  assert.deepEqual(await ok(outsider.db,"driver_statuses",{p_ride_ids:[r.ride]}),[]);
  const page1=await ok(d.db,"driver_inbox",{p_limit:1000});assert.equal(page1.length,1000);assert.ok(page1.every(p=>p.is_driver));
  const cursor=page1.at(-1),page2=await ok(d.db,"driver_inbox",{p_limit:1000,p_after_start:cursor.starts_at,p_after_id:cursor.ride_id});
  assert.equal(page1.length+page2.length,1007);assert.ok(page2.some(p=>p.ride_id===r.ride && p.coverage==='confirmed'));
  assert.ok(page2.every(p=>!page1.some(first=>first.ride_id===p.ride_id)));
  assert.deepEqual(await ok(a.db,"driver_inbox",{}),[],"Driver role filters before pagination, despite 1000+ authorized family proposals");
  assert.deepEqual(await ok(d.db,"driver_inbox",{p_pending_only:true}),[],"Pending filter excludes historical proposals before pagination");
  await denied(a.db,"driver_status",{p_ride_id:null},"PT400");
  await denied(a.db,"driver_statuses",{p_ride_ids:[r.ride,r.ride]},"PT400");
  for(const bad of [{p_limit:0},{p_limit:1001},{p_after_id:r.ride},{p_after_start:"infinity",p_after_id:r.ride}]) await denied(d.db,"driver_inbox",bad,"PT400");
  await denied(a.db,"propose_driver",nomination({...r,revision:p.p_revision}),"PT409");
  await denied(a.db,"cancel_driver_proposal",{...p,p_family_id:fa},"PT409");
  await denied(a.db,"revoke_own_consent",{...p,p_family_id:fa,p_child_ids:[cb]},"PT400");
  await ok(b.db,"revoke_own_consent",{...p,p_family_id:fb,p_child_ids:[cb]});
  assert.equal((await state(r)).coverage,"needs_driver");
  assert.deepEqual((await d.db.from("ride_locations").select("*").eq("ride_id",r.ride)).data,[]);
  await denied(b.db,"consent_for_own_children",last,"PT409");
  await ok(b.db,"revoke_own_consent",{...p,p_family_id:fb,p_child_ids:[cb]});
  // Transaction-start timestamps can precede a proposal that committed earlier.
  // The monotonic ride revision, not wall-clock creation order, selects the latest.
  sql(`update public.driver_proposals set created_at=clock_timestamp()+interval '1 day' where id='${p.p_id}'`);
  r.revision=p.p_revision+1;const fresh=await propose(r);
  assert.equal((await state(r)).proposal_id,fresh.p_id,"Current proposal selected by frozen revision");
  assert.equal((await state(r)).consent_count,0,"New proposal never reuses consent");
  const pendingInbox=await ok(d.db,"driver_inbox",{p_pending_only:true});assert.equal(pendingInbox[0].proposal_id,fresh.p_id,"Pending request is not hidden by historical rows");
  await ok(a.db,"cancel_driver_proposal",{...fresh,p_family_id:fa});
  await denied(d.db,"accept_driver_proposal",{...fresh,p_available_seats:4,p_restraints:true},"PT409");

  // Independent roles even for self nomination: all child consents alone do not assign.
  const self=await make({two:false});const ps=await propose(self,{p_driver_id:a.id,p_driver_family_id:fa,p_vehicle_id:ownCar});
  await ok(a.db,"consent_for_own_children",{...ps,p_family_id:fa,p_child_ids:[ca]});
  assert.equal((await state(self)).coverage,"awaiting_confirmation");
  await ok(a.db,"accept_driver_proposal",{...ps,p_available_seats:4,p_restraints:true});
  assert.equal((await state(self)).coverage,"confirmed");
  const selfInbox=await ok(a.db,"driver_inbox",{});assert.equal(selfInbox.length,1);assert.equal(selfInbox[0].ride_id,self.ride);
  await ok(a.db,"withdraw_driver",ps);await ok(a.db,"withdraw_driver",ps);
  assert.equal((await state(self)).coverage,"needs_driver");
  await denied(a.db,"accept_driver_proposal",{...ps,p_available_seats:4,p_restraints:true},"PT409");

  const expired=await make({two:false});const pe=await propose(expired);
  sql(`update public.driver_proposals set deadline=clock_timestamp()-interval '1 second' where id='${pe.p_id}'`);
  assert.equal((await state(expired)).proposal_status,"expired");assert.equal((await state(expired)).coverage,"needs_driver");
  await denied(d.db,"accept_driver_proposal",{...pe,p_available_seats:4,p_restraints:true},"PT410");
  await denied(a.db,"consent_for_own_children",{...pe,p_family_id:fa,p_child_ids:[ca]},"PT410");
  // Expired proposal no longer freezes roster or vehicle; old revision cannot revive it.
  await ok(a.db,"set_own_ride_riders",{p_ride_id:expired.ride,p_family_id:fa,p_revision:pe.p_revision,p_child_ids:[ca]});
  await denied(d.db,"accept_driver_proposal",{...pe,p_available_seats:4,p_restraints:true},"PT409");
  const past=await make({two:false,start:"2020-01-01T12:00Z",end:"2020-01-01T13:00Z"});await denied(a.db,"propose_driver",nomination(past),"PT410");

  // Even a reply admitted before the deadline may expire while waiting on a
  // vehicle lock. The last boundary check must use database time after waiting.
  for(const lastReply of [true,false]) {
    const delayed=await make({two:false}),pd=await propose(delayed);
    if(lastReply) await ok(d.db,"accept_driver_proposal",{...pd,p_available_seats:4,p_restraints:true});
    const locker=new pg.Client({connectionString:status.DB_URL});await locker.connect();
    try {
      await locker.query("begin");await locker.query("select id from public.vehicles where id=$1 for update",[car]);
      sql(`update public.driver_proposals set deadline=clock_timestamp()+interval '1 second' where id='${pd.p_id}'`);
      const pendingReply=(lastReply ? a.db.rpc("consent_for_own_children",{...pd,p_family_id:fa,p_child_ids:[ca]}) :
        d.db.rpc("accept_driver_proposal",{...pd,p_available_seats:4,p_restraints:true})).then(r=>r);
      await new Promise(resolve=>setTimeout(resolve,1200));await locker.query("commit");
      assert.equal((await pendingReply).error?.code,"PT410","Deadline rechecked after lock wait, including non-final replies");
      assert.equal((await state(delayed)).consent_count,0);
      if(!lastReply) assert.equal((await state(delayed)).accepted_at,null);
    }finally {await locker.end();}
  }
  // Vehicle versions are rechecked by the last reply, even if privileged fixture
  // setup bypasses the normal command's dependency guard.
  const stale=await make({two:false}),pv=await propose(stale);
  await ok(d.db,"accept_driver_proposal",{...pv,p_available_seats:4,p_restraints:true});
  sql(`update public.vehicles set version=2 where id='${car}'`);
  await denied(a.db,"consent_for_own_children",{...pv,p_family_id:fa,p_child_ids:[ca]},"PT409");
  sql(`update public.vehicles set version=1 where id='${car}'`);
  await ok(a.db,"cancel_driver_proposal",{...pv,p_family_id:fa});

  // Cross-ride concurrent finalization: same driver, different vehicles, overlapping intervals.
  const driverOtherFamily=await ok(d.db,"create_family",{p_name:"Driver second context",p_display_name:"Driver D"});
  const otherCircle=await ok(outsider.db,"create_circle",{p_family_id:fout,p_name:"Independent circle"});
  const driverInvitation=(await ok(outsider.db,"create_invitation",{p_kind:"circle",p_scope_id:otherCircle,p_email:d.email}))[0];
  await ok(d.db,"accept_invitation",{p_kind:"circle",p_token:driverInvitation.token,p_family_id:driverOtherFamily,p_display_name:"Driver D"});
  const cout=await ok(outsider.db,"save_own_child",childArgs(fout,"Other circle child"));
  const x=await make({two:false});
  const y={ride:await ok(outsider.db,"create_ride",rideArgs(fout,otherCircle,[cout])),revision:1};
  const px=await propose(x),py={p_id:await ok(outsider.db,"propose_driver",nomination(y,{p_family_id:fout,p_driver_family_id:driverOtherFamily,p_vehicle_id:secondCar})),p_revision:2};
  for(const p0 of [px,py]) await ok(d.db,"accept_driver_proposal",{...p0,p_available_seats:4,p_restraints:true});
  const races=await Promise.all([a.db.rpc("consent_for_own_children",{...px,p_family_id:fa,p_child_ids:[ca]}),outsider.db.rpc("consent_for_own_children",{...py,p_family_id:fout,p_child_ids:[cout]})]);
  assert.equal(races.filter(z=>!z.error).length,1);assert.equal(races.find(z=>z.error).error.code,"PT424");
  const xWon=!races[0].error;
  const win=xWon?x:y,loss=xWon?y:x,ploss=xWon?py:px;
  const winningDb=xWon?a.db:outsider.db,losingDb=xWon?outsider.db:a.db;
  const winningFamily=xWon?fa:fout,losingFamily=xWon?fout:fa,losingChild=xWon?cout:ca;
  assert.equal((await state(loss,losingDb)).consent_count,0,"Conflicting final reply rolls back across circles with disjoint family locks");
  await ok(winningDb,"cancel_ride",{p_ride_id:win.ride,p_family_id:winningFamily,p_revision:2});
  assert.equal((await state(win,winningDb)).coverage,"needs_driver");
  assert.equal(await ok(losingDb,"consent_for_own_children",{...ploss,p_family_id:losingFamily,p_child_ids:[losingChild]}),"confirmed","Cancellation releases reservations atomically");
  await ok(d.db,"withdraw_driver",ploss);
  // Nomination and finalization use the same profile-before-vehicle order,
  // including the nominator's FK when the driver self-nominates across circles.
  const lockRide=await make({two:false}),lockProposal=await propose(lockRide);
  await ok(d.db,"accept_driver_proposal",{...lockProposal,p_available_seats:4,p_restraints:true});
  const driverChild=await ok(d.db,"save_own_child",childArgs(driverOtherFamily,"Driver's own child"));
  const selfRide={ride:await ok(d.db,"create_ride",rideArgs(driverOtherFamily,otherCircle,[driverChild])),revision:1};
  const selfNomination=nomination(selfRide,{p_family_id:driverOtherFamily,p_driver_family_id:driverOtherFamily});
  const blocker=new pg.Client({connectionString:status.DB_URL});await blocker.connect();
  async function waitForWaiters(count) {
    for(let attempt=0;attempt<100;attempt++) {
      await blocker.query("select pg_stat_clear_snapshot()");
      const result=await blocker.query("select count(*)::integer as count from pg_stat_activity where wait_event_type='Lock' and (query like '%propose_driver%' or query like '%consent_for_own_children%')");
      if(result.rows[0].count>=count) return;
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    assert.fail("Expected concurrent command to reach its database lock");
  }
  try {
    await blocker.query("begin");await blocker.query("select id from public.vehicles where id=$1 for update",[car]);
    const nominating=d.db.rpc("propose_driver",selfNomination).then(r=>r);
    await waitForWaiters(1);
    const confirming=a.db.rpc("consent_for_own_children",{...lockProposal,p_family_id:fa,p_child_ids:[ca]}).then(r=>r);
    await waitForWaiters(2);await blocker.query("commit");
    const operations=await Promise.all([nominating,confirming]);operations.forEach(r=>assert.ifError(r.error));
    assert.equal(operations[1].data,"confirmed");
    await ok(d.db,"cancel_driver_proposal",{p_id:operations[0].data,p_revision:2,p_family_id:driverOtherFamily});
  } finally {await blocker.end();}
  await ok(d.db,"withdraw_driver",lockProposal);
  // Half-open intervals permit adjacent rides using the same vehicle.
  const adjacent=[];
  for(const [start,end] of [["2027-11-07T10:00Z","2027-11-07T11:00Z"],["2027-11-07T11:00Z","2027-11-07T12:00Z"]]) {
    const rr=await make({two:false,start,end}),pp=await propose(rr);adjacent.push(pp);
    await ok(a.db,"consent_for_own_children",{...pp,p_family_id:fa,p_child_ids:[ca]});await ok(d.db,"accept_driver_proposal",{...pp,p_available_seats:4,p_restraints:true});
  }
  for(const pp of adjacent) await ok(d.db,"withdraw_driver",pp);
  // Cancellation races the final reply; either ordering leaves no active assignment.
  const cr=await make({two:false}),pc=await propose(cr);
  await ok(d.db,"accept_driver_proposal",{...pc,p_available_seats:4,p_restraints:true});
  const cancellation=await Promise.all([a.db.rpc("cancel_ride",{p_ride_id:cr.ride,p_family_id:fa,p_revision:2}),a.db.rpc("consent_for_own_children",{...pc,p_family_id:fa,p_child_ids:[ca]})]);
  assert.ifError(cancellation[0].error);
  assert.equal(sql(`select count(*) from public.driver_assignments where ride_id='${cr.ride}' and released_at is null`),"0");
  assert.equal(sql(`select count(*) from public.driver_proposals where ride_id='${cr.ride}' and status='pending'`),"0");

  // Removal of the consenting guardian closes coverage even with live JWTs.
  const mr=await make(),pm=await propose(mr);
  await ok(d.db,"accept_driver_proposal",{...pm,p_available_seats:4,p_restraints:true});
  await ok(a.db,"consent_for_own_children",{...pm,p_family_id:fa,p_child_ids:[ca]});
  await ok(g.db,"consent_for_own_children",{...pm,p_family_id:fb,p_child_ids:[cb,cb2]});
  await ok(b.db,"remove_family_member",{p_family_id:fb,p_user_id:g.id});
  assert.equal((await state(mr)).coverage,"needs_driver");
  await denied(g.db,"consent_for_own_children",{...pm,p_family_id:fb,p_child_ids:[cb]},"PT404");
  // Driver membership removal and circle-family removal each invalidate atomically.
  const m2=await make({two:false}),p2=await propose(m2,{p_driver_id:spare.id,p_vehicle_id:await ok(spare.db,"save_vehicle",vehicleArgs())});
  await ok(a.db,"consent_for_own_children",{...p2,p_family_id:fa,p_child_ids:[ca]});await ok(spare.db,"accept_driver_proposal",{...p2,p_available_seats:4,p_restraints:true});
  await ok(d.db,"remove_family_member",{p_family_id:fd,p_user_id:spare.id});
  assert.equal((await state(m2)).coverage,"needs_driver");
  assert.deepEqual(await ok(spare.db,"driver_status",{p_ride_id:m2.ride}),[]);
  const m3=await make(),p3=await propose(m3);
  await ok(a.db,"consent_for_own_children",{...p3,p_family_id:fa,p_child_ids:[ca]});await ok(b.db,"consent_for_own_children",{...p3,p_family_id:fb,p_child_ids:[cb,cb2]});await ok(d.db,"accept_driver_proposal",{...p3,p_available_seats:4,p_restraints:true});
  await ok(a.db,"remove_circle_family",{p_circle_id:circle,p_family_id:fb});
  assert.equal((await state(m3)).coverage,"needs_driver");
  assert.deepEqual((await b.db.from("driver_assignments").select("*").eq("ride_id",m3.ride)).data,[]);
  // Removing the nominated driver's circle-family races their last acceptance.
  // If acceptance wins first, removal invalidates it before committing; if removal
  // wins, the same still-live driver JWT can no longer accept.
  const m4=await make({two:false}),p4=await propose(m4);
  await ok(a.db,"consent_for_own_children",{...p4,p_family_id:fa,p_child_ids:[ca]});
  const removalRace=await Promise.all([a.db.rpc("remove_circle_family",{p_circle_id:circle,p_family_id:fd}),d.db.rpc("accept_driver_proposal",{...p4,p_available_seats:4,p_restraints:true})]);
  assert.ifError(removalRace[0].error);
  assert.equal((await state(m4)).coverage,"needs_driver");
  assert.equal(sql(`select count(*) from public.driver_assignments where ride_id='${m4.ride}' and released_at is null`),"0");
  await denied(d.db,"accept_driver_proposal",{...p4,p_available_seats:4,p_restraints:true},"PT404");
  assert.deepEqual((await d.db.from("ride_locations").select("*").eq("ride_id",m4.ride)).data,[]);
  // Explicit action grants, no anonymous commands or exposed finalizer/private schema.
  const commands={save_vehicle:carArgs,propose_driver:args,accept_driver_proposal:{...p,p_available_seats:4,p_restraints:true},consent_for_own_children:last,decline_driver_proposal:p,cancel_driver_proposal:{...p,p_family_id:fa},withdraw_driver:p,revoke_own_consent:last,driver_options:{p_ride_id:r.ride},driver_status:{p_ride_id:r.ride},driver_statuses:{p_ride_ids:[r.ride]},driver_inbox:{}};
  for(const [name,params] of Object.entries(commands)) await denied(anon,name,params);
  await denied(a.db,"finalize_driver",{p_id:p.p_id});
  assert.ok((await a.db.schema("pool_private").rpc("finalize_driver",{p_id:p.p_id})).error);
  assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef"),"0");
  assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='pool_private' and p.prosecdef and not ('search_path=\"\"'=any(p.proconfig))"),"0");
  console.log("R5 real-session checks passed: separate acceptance/child consent, private projections, frozen revisions, capacity/restraints, deadlines, duplicates, concurrent assignment/conflicts, cancellation and membership/consent invalidation.");
}
