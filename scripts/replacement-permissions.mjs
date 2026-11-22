import assert from "node:assert/strict";
import pg from "pg";
import { setup } from "./handoff-permissions.mjs";
import { hoursFrom } from "./auth-test-dates.mjs";
const ok = async (db,name,args) => { const r=await db.rpc(name,args); assert.ifError(r.error); return r.data; };
const denied = async (db,name,args,code) => { const r=await db.rpc(name,args); assert.ok(r.error,`${name} must deny`); if(code) assert.equal(r.error.code,code,`${name}: ${r.error.message}`); };
const state = async(f,r,db=f.a.db)=>(await ok(db,"driver_status",{p_ride_id:r.ride}))[0];
const consent=(p,family,children)=>({...p,p_family_id:family,p_child_ids:children});
const accept=p=>({...p,p_available_seats:3,p_restraints:true});
export async function replacementUpgradeIdentity(status) {
  const f=await setup(status),r=await f.confirmed();
  const before=await state(f,r);
  return async()=>{
    const after=await state(f,r);
    assert.equal(after.proposal_id,before.proposal_id);assert.equal(after.coverage,"confirmed");
    assert.ok(after.current_assignment_id);assert.equal(after.mode,"initial");
    assert.deepEqual((await f.a.db.from("replacement_events").select("*").eq("ride_id",r.ride)).data,[]);
  };
}
// Build actual R7 data under the original R7 migration, before the forward fixes.
export async function replacementCompletedUpgradeIdentity(status) {
  const f=await setup(status),{a,b,d,driverGuardian:g,children:[ca,cb]}=f,r=await f.confirmed();
  const original=await state(f,r),car=await ok(g.db,"save_vehicle",{p_id:crypto.randomUUID(),p_label:"Upgrade candidate",p_passenger_seats:3,p_version:0,p_retire:false});
  const id=await ok(a.db,"request_replacement",{p_id:crypto.randomUUID(),p_ride_id:r.ride,p_family_id:a.family,p_revision:r.revision,p_driver_id:g.id,p_driver_family_id:d.family,p_vehicle_id:car,p_vehicle_version:1,p_mode:"optional_swap",p_original_assignment_id:original.current_assignment_id,p_original_assignment_revision:original.current_assignment_revision,p_deadline:original.starts_at});
  await ok(g.db,"decline_driver_proposal",{p_id:id,p_revision:r.revision});
  for(const [parent,child] of [[a,ca],[b,cb]]) await ok(parent.db,"designate_recipient",{p_ride_id:r.ride,p_child_id:child,p_recipient_id:parent.id,p_revision:r.revision,p_version:0});
  for(const [parent,child] of [[a,ca],[b,cb]]) {
    const args={p_request_id:crypto.randomUUID(),p_ride_id:r.ride,p_child_id:child,p_revision:r.revision,p_version:1};
    await ok(d.db,"record_pickup",args);await ok(d.db,"report_arrival",{...args,p_request_id:crypto.randomUUID(),p_version:2});await ok(parent.db,"confirm_handoff",{...args,p_request_id:crypto.randomUUID(),p_version:3});
  }
  assert.equal((await state(f,r)).coverage,"needs_driver","Original R7 schema reproduces the reviewed completed-coverage bug");
  // A request the driver accepted under the consent rules, still short of family B's consent.
  const waiting=await f.proposed();
  assert.equal(await ok(d.db,"accept_driver_proposal",accept(waiting.reply)),"awaiting_confirmation");
  await ok(a.db,"consent_for_own_children",consent(waiting.reply,a.family,[ca]));
  return async()=>{
    // The upgrade leaves that request open; nothing waits on a family any more,
    // and the driver's next yes confirms it without the missing consent.
    const carried=await state(f,waiting,b.db);
    assert.equal(carried.coverage,"awaiting_confirmation");assert.ok(carried.accepted_at);assert.equal(carried.consent_count,1);
    assert.deepEqual(await ok(b.db,"pending_family_consents",{}),[]);
    assert.equal(await ok(d.db,"accept_driver_proposal",accept(waiting.reply)),"confirmed");
    assert.equal((await state(f,waiting)).coverage,"confirmed");
    const after=await state(f,r,d.db);assert.equal(after.coverage,"confirmed");assert.equal(after.is_completed_driver,true);assert.equal(after.is_current_driver,false);
    assert.equal((await d.db.from("ride_events").select("*").eq("ride_id",r.ride)).data.length,6,"Existing R7 events survive the forward read fixes");
    assert.ok((await d.db.from("ride_trips").select("completed_at").eq("ride_id",r.ride).single()).data.completed_at);
  };
}
export async function replacementPermissionTests(status,sql) {
  const f=await setup(status),{a,b,d,driverGuardian:g,out,children:[ca,cb],planned,confirmed}=f;
  const car=await ok(g.db,"save_vehicle",{p_id:crypto.randomUUID(),p_label:"Replacement van",p_passenger_seats:3,p_version:0,p_retire:false});
  const small=await ok(g.db,"save_vehicle",{p_id:crypto.randomUUID(),p_label:"Small car",p_passenger_seats:1,p_version:0,p_retire:false});
  async function nomination(r,changes={}) {
    const s=await state(f,r);
    return {p_id:crypto.randomUUID(),p_ride_id:r.ride,p_family_id:a.family,p_revision:(await a.db.from("rides").select("revision").eq("id",r.ride).single()).data.revision,p_driver_id:g.id,p_driver_family_id:d.family,p_vehicle_id:car,p_vehicle_version:1,p_mode:s.coverage==='confirmed'?'optional_swap':'unavailable',p_original_assignment_id:s.current_assignment_id,p_original_assignment_revision:s.current_assignment_revision,p_deadline:s.starts_at,...changes};
  }
  async function request(r,changes={}) { const n=await nomination(r,changes);await ok(a.db,"request_replacement",n);return {p_id:n.p_id,p_revision:n.p_revision}; }
  // One reply short of the change: the candidate's own yes confirms it. Family A's
  // consent is optional and recorded only to prove it neither helps nor hinders.
  async function ready(r) {
    const p=await request(r);await ok(a.db,"consent_for_own_children",consent(p,a.family,[ca]));return p;
  }
  const active=r=>sql(`select coalesce(string_agg(driver_id::text,','),'') from public.driver_assignments where ride_id='${r.ride}' and released_at is null`);
  // What changed: who is driving is announced to the families riding and to the
  // driver; who joined or left is announced only to whoever is driving.
  const since=new Date(Date.now()-3600_000).toISOString();
  const told=async(person,ride)=>(await ok(person.db,"ride_updates",{p_since:since,p_limit:100})).filter(row=>row.ride_id===ride.ride).map(row=>`${row.kind}:${row.who}`);
  const tellAll=async(ride,expected)=>{ for(const [name,person] of Object.entries({a,b,d,g,out})) assert.deepEqual(await told(person,ride),expected[name]||[],`ride_updates for ${name}`); };
  const u=await planned({respond:false});
  await tellAll(u,{});
  const asked={p_id:await ok(a.db,"propose_driver",{p_id:crypto.randomUUID(),p_ride_id:u.ride,p_family_id:a.family,p_revision:1,p_driver_id:d.id,p_driver_family_id:d.family,p_vehicle_id:f.car,p_vehicle_version:1}),p_revision:2};
  u.revision=2;
  await tellAll(u,{});
  assert.equal(await ok(d.db,"accept_driver_proposal",accept(asked)),"confirmed");
  await tellAll(u,{a:["driver_set:R6 driver"]});
  const announced=(await ok(a.db,"ride_updates",{p_since:since})).find(row=>row.ride_id===u.ride);
  assert.deepEqual(Object.keys(announced).sort(),["destination_summary","kind","occurred_at","pickup_summary","ride_id","starts_at","timezone","who"]);
  assert.equal(announced.pickup_summary,"R6 pickup");assert.equal(announced.destination_summary,"R6 drop-off");assert.equal(announced.starts_at,(await state(f,u)).starts_at);
  assert.deepEqual(await ok(a.db,"ride_updates",{p_since:new Date(Date.now()+3600_000).toISOString()}),[],"Nothing older than the asked-for moment");
  await ok(b.db,"respond_to_ride_invitation",{p_ride_id:u.ride,p_family_id:b.family,p_revision:2,p_accept:true,p_child_ids:[cb]});
  await tellAll(u,{a:["driver_set:R6 driver"],b:["driver_set:R6 driver"],d:["family_joined:R6 guardian-b"]});
  // The new driver's yes alone confirms a swap and releases the old driver as replaced.
  const before=await state(f,u),swapped=await request(u);
  assert.equal(active(u),d.id);
  assert.equal(await ok(g.db,"accept_driver_proposal",accept(swapped)),"confirmed","Swap confirms on the new driver's accept alone");
  assert.equal(active(u),g.id);
  assert.equal(sql(`select release_reason from public.driver_assignments where id='${before.current_assignment_id}'`),"replaced");
  assert.equal(sql(`select status from public.driver_proposals where id='${before.proposal_id}'`),"invalidated");
  assert.equal(sql(`select count(*) from public.ride_driver_consents where ride_id='${u.ride}'`),"0");
  const after=await state(f,u,b.db);
  assert.equal(after.coverage,"confirmed");assert.equal(after.proposal_id,swapped.p_id);assert.equal(after.current_driver_name,"R6 extra");assert.equal(after.ride_revision,before.ride_revision);
  assert.equal((await state(f,u,g.db)).is_current_driver,true);
  assert.deepEqual(await ok(d.db,"driver_status",{p_ride_id:u.ride}),[],"The replaced driver loses the ride");
  await tellAll(u,{a:["driver_changed:R6 extra"],b:["driver_changed:R6 extra"],g:["family_joined:R6 guardian-b"]});
  await ok(b.db,"set_own_ride_riders",{p_ride_id:u.ride,p_family_id:b.family,p_revision:2,p_child_ids:[]});
  assert.equal(active(u),g.id);
  await tellAll(u,{a:["driver_changed:R6 extra"],g:["family_left:R6 guardian-b"]});
  await ok(g.db,"withdraw_driver",swapped);
  await tellAll(u,{a:["driver_left:R6 extra"]});
  for(const bad of [{p_since:null},{p_since:"infinity"},{p_since:"-infinity"},{p_since:since,p_limit:0},{p_since:since,p_limit:101},{p_since:since,p_limit:null}]) await denied(a.db,"ride_updates",bad,"PT400");
  await denied(f.anon,"ride_updates",{p_since:since});
  assert.ok((await a.db.schema("pool_private").rpc("ride_updates",{p_since:since,p_limit:20})).error);
  await ok(a.db,"cancel_ride",{p_ride_id:u.ride,p_family_id:a.family,p_revision:3});
  await tellAll(u,{});
  // An unanswered invitation does not hold up a swap either.
  const w=await planned({respond:false});
  const first={p_id:await ok(a.db,"propose_driver",{p_id:crypto.randomUUID(),p_ride_id:w.ride,p_family_id:a.family,p_revision:1,p_driver_id:d.id,p_driver_family_id:d.family,p_vehicle_id:f.car,p_vehicle_version:1}),p_revision:2};
  w.revision=2;
  assert.equal(await ok(d.db,"accept_driver_proposal",accept(first)),"confirmed");
  const takeover=await request(w);
  assert.equal(await ok(g.db,"accept_driver_proposal",accept(takeover)),"confirmed");assert.equal(active(w),g.id);
  assert.equal((await state(f,w,b.db)).current_driver_name,"R6 extra","The invited family sees the new driver");
  await ok(g.db,"withdraw_driver",takeover);
  const r=await confirmed(),original=await state(f,r);
  const args=await nomination(r);
  await denied(out.db,"request_replacement",args,"PT404");await denied(f.anon,"request_replacement",args);
  for(const change of [{p_deadline:hoursFrom(Date.parse(args.p_deadline),1)},{p_deadline:"infinity"},{p_mode:"fake"},{p_original_assignment_revision:99},{p_original_assignment_id:crypto.randomUUID()},{p_driver_id:d.id},{p_vehicle_version:99},{p_vehicle_id:small},{p_mode:"unavailable"}]) await denied(a.db,"request_replacement",{...args,...change});
  const competing=await Promise.all([a.db.rpc("request_replacement",args),a.db.rpc("request_replacement",{...args,p_id:crypto.randomUUID()})]);
  assert.equal(competing.filter(x=>!x.error).length,1);assert.equal(competing.find(x=>x.error).error.code,"PT409");
  const p={p_id:competing.find(x=>!x.error).data,p_revision:args.p_revision};
  await ok(a.db,"request_replacement",{...args,p_id:p.p_id});
  assert.equal(sql(`select count(*) from public.replacement_events where proposal_id='${p.p_id}' and kind='requested'`),"1");
  assert.equal(active(r),d.id);assert.equal((await state(f,r)).coverage,"confirmed");
  assert.ok((await ok(g.db,"driver_inbox",{p_pending_only:true})).some(row=>row.proposal_id===p.p_id));
  assert.ok((await ok(d.db,"driver_inbox",{p_pending_only:true})).every(row=>row.proposal_id!==p.p_id));
  assert.equal((await state(f,r,d.db)).is_current_driver,true,"Original driver retains controls while candidate reviews");
  await denied(a.db,"accept_driver_proposal",accept(p),"PT404");
  await denied(out.db,"consent_for_own_children",consent(p,a.family,[ca]),"PT404");
  await denied(b.db,"consent_for_own_children",consent(p,a.family,[ca]),"PT404");
  await denied(a.db,"consent_for_own_children",consent(p,a.family,[cb]),"PT400");
  await denied(b.db,"consent_for_own_children",consent(p,b.family,[cb,cb]),"PT400");
  // Saving the same riders during a swap keeps the driver, the request and the revision.
  assert.equal(await ok(a.db,"set_own_ride_riders",{p_ride_id:r.ride,p_family_id:a.family,p_revision:r.revision,p_child_ids:[ca]}),r.revision);
  assert.equal((await state(f,r)).proposal_id,p.p_id);assert.equal((await state(f,r)).proposal_status,"pending");assert.equal(active(r),d.id);
  await denied(g.db,"save_vehicle",{p_id:car,p_label:"Changed van",p_passenger_seats:3,p_version:1,p_retire:false},"PT423");
  for(let retry=0;retry<3;retry++) await ok(a.db,"consent_for_own_children",consent(p,a.family,[ca]));
  await ok(b.db,"consent_for_own_children",consent(p,b.family,[cb]));
  assert.equal((await state(f,r)).consent_count,2);assert.equal(active(r),d.id,"Family consent alone never changes the driver");
  await ok(a.db,"cancel_driver_proposal",{...p,p_family_id:a.family});assert.equal(active(r),d.id);
  for(const [name,data] of [["accept_driver_proposal",accept(p)],["consent_for_own_children",consent(p,b.family,[cb])],["cancel_driver_proposal",{...p,p_family_id:a.family}]]) await denied(name==='accept_driver_proposal'?g.db:name==='cancel_driver_proposal'?a.db:b.db,name,data,"PT409");
  const declined=await request(r);await ok(g.db,"decline_driver_proposal",declined);assert.equal(active(r),d.id);
  const expired=await request(r);sql(`update public.driver_proposals set deadline=clock_timestamp()-interval '1 second' where id='${expired.p_id}'`);
  assert.equal((await state(f,r)).proposal_status,"expired");assert.equal(active(r),d.id);
  await denied(g.db,"accept_driver_proposal",accept(expired),"PT410");await denied(a.db,"cancel_driver_proposal",{...expired,p_family_id:a.family},"PT410");
  const swap=await ready(r);
  await ok(d.db,"withdraw_driver",{p_id:original.proposal_id,p_revision:original.ride_revision});assert.equal(active(r),"");
  await denied(g.db,"accept_driver_proposal",accept(swap),"PT409");assert.equal(active(r),"","A swap cannot outlive the driver it replaces");
  await denied(b.db,"consent_for_own_children",consent(swap,b.family,[cb]),"PT409");
  const fresh=await request(r);assert.equal((await state(f,r)).accepted_at,null);assert.equal((await state(f,r)).consent_count,0);
  await ok(a.db,"consent_for_own_children",consent(fresh,a.family,[ca]));await ok(a.db,"consent_for_own_children",consent(fresh,a.family,[ca]));
  assert.equal(active(r),"");await ok(g.db,"decline_driver_proposal",fresh);assert.equal(active(r),"");
  const cancel=await request(r);await ok(a.db,"cancel_driver_proposal",{...cancel,p_family_id:a.family});assert.equal(active(r),"");
  const timeout=await request(r);sql(`update public.driver_proposals set deadline=clock_timestamp()-interval '1 second' where id='${timeout.p_id}'`);assert.equal((await state(f,r)).proposal_status,"expired");assert.equal(active(r),"");
  // The candidate's yes covers the ride at once; a second identical reply cannot confirm twice.
  const final=await request(r);
  const approvals=await Promise.all([g.db.rpc("accept_driver_proposal",accept(final)),g.db.rpc("accept_driver_proposal",accept(final))]);
  assert.equal(approvals.filter(x=>!x.error).length,1);assert.equal(approvals.find(x=>!x.error).data,"confirmed");
  assert.equal(approvals.find(x=>x.error).error.code,"PT409");assert.equal(active(r),g.id);
  await denied(g.db,"accept_driver_proposal",accept(final),"PT409");
  await denied(b.db,"consent_for_own_children",consent(final,b.family,[cb]),"PT409");
  assert.equal(sql(`select count(*) from public.driver_assignments where proposal_id='${final.p_id}'`),"1");
  assert.equal(sql(`select count(*) from public.ride_driver_consents where proposal_id='${final.p_id}'`),"0","Covered without any family consent");
  const driverLastRide=await confirmed();await ok(d.db,"withdraw_driver",driverLastRide.reply);
  const driverLast=await request(driverLastRide);
  await ok(a.db,"consent_for_own_children",consent(driverLast,a.family,[ca]));await ok(b.db,"consent_for_own_children",consent(driverLast,b.family,[cb]));
  assert.equal(active(driverLastRide),"","All family consents without the candidate's actual acceptance leave the ride uncovered");
  await denied(a.db,"accept_driver_proposal",accept(driverLast),"PT404");
  assert.equal(await ok(g.db,"accept_driver_proposal",accept(driverLast)),"confirmed");await ok(g.db,"withdraw_driver",driverLast);
  const legacyRide=await confirmed();await ok(d.db,"withdraw_driver",legacyRide.reply);
  const legacyNomination=await nomination(legacyRide);
  const legacyArgs=Object.fromEntries(Object.entries(legacyNomination).filter(([key])=>!["p_mode","p_original_assignment_id","p_original_assignment_revision","p_deadline"].includes(key)));
  await ok(a.db,"propose_driver",legacyArgs);
  const legacyState=await state(f,legacyRide);assert.equal(legacyState.mode,"unavailable");assert.equal(legacyState.accepted_at,null);assert.equal(legacyState.consent_count,0);
  const savedLegacy=(await a.db.from("driver_proposals").select("original_assignment_id,original_assignment_revision").eq("id",legacyArgs.p_id).single()).data;
  assert.equal(savedLegacy.original_assignment_id,legacyNomination.p_original_assignment_id);assert.equal(savedLegacy.original_assignment_revision,legacyNomination.p_original_assignment_revision);
  await ok(a.db,"cancel_driver_proposal",{p_id:legacyArgs.p_id,p_revision:legacyState.ride_revision,p_family_id:a.family});assert.equal(active(legacyRide),"");
  await denied(g.db,"accept_driver_proposal",accept({p_id:legacyArgs.p_id,p_revision:legacyState.ride_revision}),"PT409");
  // Valid direct writes are denied, including forged history/assignment and proposal mode/deadline.
  for(const db of [a.db,g.db,out.db]) {
    assert.equal((await db.from("driver_proposals").update({deadline:hoursFrom(Date.parse(r.start),1),mode:"optional_swap"}).eq("id",final.p_id)).error?.code,"42501");
    assert.equal((await db.from("replacement_events").insert({proposal_id:final.p_id,ride_id:r.ride,actor_id:d.id,actor_name:"Fabricated",kind:"confirmed"})).error?.code,"42501");
    assert.equal((await db.from("replacement_events").delete().eq("ride_id",r.ride)).error?.code,"42501");
    assert.equal((await db.from("driver_assignments").update({released_at:null,release_reason:null}).eq("id",original.current_assignment_id)).error?.code,"42501");
  }
  assert.deepEqual((await out.db.from("replacement_events").select("*").eq("ride_id",r.ride)).data,[]);
  const events=(await a.db.from("replacement_events").select("*").eq("ride_id",r.ride)).data;
  assert.ok(events.some(e=>e.kind==='confirmed'&&e.actor_id===g.id&&e.proposal_id===final.p_id),"The accepting driver is recorded as confirming");
  assert.throws(()=>sql(`delete from public.replacement_events where ride_id='${r.ride}'`));
  // Capacity, vehicle version and reservation failures roll back both the confirming reply and original release.
  for(const failure of ["capacity","version","reservation","event"]) {
    const x=await confirmed(),q=await ready(x);
    if(failure==='capacity') sql(`update public.vehicles set passenger_seats=1 where id='${car}'`);
    if(failure==='version') sql(`update public.vehicles set version=2 where id='${car}'`);
    if(failure==='reservation') sql(`insert into public.driver_assignments(proposal_id,ride_id,ride_revision,driver_id,vehicle_id,vehicle_version,starts_at,ends_at) select id,ride_id,ride_revision,driver_id,vehicle_id,vehicle_version,'${x.start}','${x.end}' from public.driver_proposals where id='${final.p_id}' on conflict(proposal_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at`);
    if(failure==='event') sql(`create function pool_private.fail_r7_event() returns trigger language plpgsql as $$begin if new.kind='confirmed' then raise exception 'fixture_event_failure'; end if; return new; end$$; create trigger fail_r7_event before insert on public.replacement_events for each row execute function pool_private.fail_r7_event()`);
    await denied(g.db,"accept_driver_proposal",accept(q));assert.equal(active(x),d.id);
    assert.equal((await state(f,x)).accepted_at,null);assert.equal((await state(f,x)).proposal_status,"pending");assert.equal((await state(f,x)).consent_count,1);
    if(failure==='capacity') sql(`update public.vehicles set passenger_seats=3 where id='${car}'`);
    if(failure==='version') sql(`update public.vehicles set version=1 where id='${car}'`);
    if(failure==='reservation') sql(`update public.driver_assignments set starts_at='${r.start}',ends_at='${r.end}' where proposal_id='${final.p_id}'`);
    if(failure==='event') sql(`drop trigger fail_r7_event on public.replacement_events; drop function pool_private.fail_r7_event()`);
    await ok(a.db,"cancel_driver_proposal",{...q,p_family_id:a.family});
  }
  // Candidate membership removal invalidates just the swap; original family consent revocation clears coverage.
  const membershipRide=await confirmed(),membershipSwap=await ready(membershipRide);
  await ok(d.db,"remove_family_member",{p_family_id:d.family,p_user_id:g.id});
  assert.equal(active(membershipRide),d.id);assert.equal((await state(f,membershipRide)).proposal_status,"invalidated");
  await denied(g.db,"accept_driver_proposal",accept(membershipSwap),"PT404");
  const invite=(await ok(d.db,"create_invitation",{p_kind:"guardian",p_scope_id:d.family,p_email:g.email}))[0];
  await ok(g.db,"accept_invitation",{p_kind:"guardian",p_token:invite.token,p_display_name:"R7 candidate"});
  const revokeSwap=await ready(membershipRide);
  await ok(a.db,"revoke_own_consent",consent(membershipRide.reply,a.family,[ca]));
  assert.equal(active(membershipRide),"");await denied(b.db,"consent_for_own_children",consent(revokeSwap,b.family,[cb]),"PT409");
  await denied(g.db,"accept_driver_proposal",accept(revokeSwap),"PT409");assert.equal(active(membershipRide),"");
  // Deliberate privileged roster/revision corruption cannot carry an acceptance into a changed plan.
  for(const corruption of ["roster","revision"]) {
    const x=await confirmed(),q=await ready(x);
    if(corruption==='roster') sql(`update public.driver_proposals set roster=roster || '[{"child":"00000000-0000-0000-0000-000000000000","family":"${a.family}","seat":"booster"}]'::jsonb where id='${q.p_id}'`);
    else assert.throws(()=>sql(`update public.driver_proposals set ride_revision=ride_revision+1 where id='${q.p_id}'`));
    await denied(g.db,"accept_driver_proposal",accept(corruption==='revision'?{...q,p_revision:q.p_revision-1}:q),"PT409");assert.equal(active(x),d.id);
    // Close through original withdrawal: no stale candidate acceptance can restore coverage.
    await ok(d.db,"withdraw_driver",x.reply);
    await denied(g.db,"accept_driver_proposal",accept(q),"PT409");assert.equal(active(x),"");
  }
  // A reply that waits past the database deadline must restore the original reservation.
  for(const operation of ["accept","cancel"]) {
  const delayed=await confirmed(),late=await ready(delayed);
  const blocker=new pg.Client({connectionString:status.DB_URL});await blocker.connect();
  try {
    await blocker.query("begin");await blocker.query(operation==='accept'?"select id from public.vehicles where id=$1 for update":"select id from public.profiles where id=$1 for update",[operation==='accept'?car:g.id]);
    sql(`update public.driver_proposals set deadline=clock_timestamp()+interval '1 second' where id='${late.p_id}'`);
    const reply=(operation==='accept'?g.db.rpc("accept_driver_proposal",accept(late)):a.db.rpc("cancel_driver_proposal",{...late,p_family_id:a.family})).then(x=>x);
    await new Promise(resolve=>setTimeout(resolve,1250));await blocker.query("commit");
    assert.equal((await reply).error?.code,"PT410");assert.equal(active(delayed),d.id);assert.equal((await state(f,delayed)).consent_count,1);
    assert.equal((await state(f,delayed)).accepted_at,null);
  }finally{await blocker.end();}
  }
  // A failed swap must not make a completed original trip look uncovered.
  for(const outcome of ["cancel","decline","expiry","pickup"]) {
    const x=await confirmed(),q=await request(x);
    if(outcome==='cancel') await ok(a.db,"cancel_driver_proposal",{...q,p_family_id:a.family});
    if(outcome==='decline') await ok(g.db,"decline_driver_proposal",q);
    if(outcome==='expiry') sql(`update public.driver_proposals set deadline=clock_timestamp()-interval '1 second' where id='${q.p_id}'`);
    for(const [parent,child] of [[a,ca],[b,cb]]) await ok(parent.db,"designate_recipient",{p_ride_id:x.ride,p_child_id:child,p_recipient_id:parent.id,p_revision:x.revision,p_version:0});
    for(const [parent,child] of [[a,ca],[b,cb]]) {
      const args={p_request_id:crypto.randomUUID(),p_ride_id:x.ride,p_child_id:child,p_revision:x.revision,p_version:1};
      await ok(d.db,"record_pickup",args);await ok(d.db,"report_arrival",{...args,p_request_id:crypto.randomUUID(),p_version:2});
      await ok(parent.db,"confirm_handoff",{...args,p_request_id:crypto.randomUUID(),p_version:3});
    }
    assert.equal(active(x),"","Completion releases the actual original reservation");
    const completed=await state(f,x);assert.equal(completed.proposal_id,q.p_id,"The unsuccessful candidate remains newest");
    assert.equal(completed.coverage,"confirmed",`${outcome}: completed original assignment still supplies historical coverage`);
    assert.equal((await ok(a.db,"driver_statuses",{p_ride_ids:[x.ride]}))[0].coverage,"confirmed");
    const actualDriver=await state(f,x,d.db);
    assert.equal(actualDriver.is_current_driver,false,"Completed reservation is not active");assert.equal(actualDriver.is_driver,false,"Latest candidate is a different adult");
    assert.equal(actualDriver.is_completed_driver,true,"The actual driver retains completed-trip identity");
    assert.ok((await ok(d.db,"driver_inbox",{})).some(row=>row.ride_id===x.ride && row.is_completed_driver));
    assert.equal((await d.db.from("ride_events").select("*").eq("ride_id",x.ride)).data.length,6);
    assert.deepEqual(await ok(out.db,"driver_status",{p_ride_id:x.ride}),[]);
  }
  // Confirming accept versus original withdrawal/cancellation/pickup. Locks make both orderings safe.
  for(const race of ["withdraw","cancel","pickup"]) {
    const x=await confirmed(),q=await ready(x),s=await state(f,x);
    if(race==='pickup') for(const [parent,child] of [[a,ca],[b,cb]]) await ok(parent.db,"designate_recipient",{p_ride_id:x.ride,p_child_id:child,p_recipient_id:parent.id,p_revision:x.revision,p_version:0});
    const other=race==='withdraw'?d.db.rpc("withdraw_driver",x.reply):race==='cancel'?a.db.rpc("cancel_driver_proposal",{...q,p_family_id:a.family}):d.db.rpc("record_pickup",{p_request_id:crypto.randomUUID(),p_ride_id:x.ride,p_child_id:ca,p_revision:x.revision,p_version:1});
    const results=await Promise.all([other.then(x=>x),g.db.rpc("accept_driver_proposal",accept(q)).then(x=>x)]);
    assert.ok(results.some(x=>!x.error));
    const driver=active(x),trip=sql(`select count(*) from public.ride_trips where ride_id='${x.ride}'`);
    if(trip==='1') { assert.equal(driver,d.id);await denied(a.db,"request_replacement",await nomination(x),"PT423");await denied(g.db,"accept_driver_proposal",accept(q),"PT423"); }
    else { assert.ok(["",d.id,g.id].includes(driver));if(race==='cancel') assert.ok([d.id,g.id].includes(driver)); }
    if(driver===g.id) assert.equal((await state(f,x)).proposal_status,"confirmed");
    if(race==='withdraw' && !results[0].error) assert.equal(driver,"");
    if(race==='cancel' && !results[0].error) assert.equal(driver,d.id);
    if(trip==='0'&&driver) await ok((driver===d.id?d:g).db,"withdraw_driver",{p_id:driver===d.id?s.current_proposal_id:q.p_id,p_revision:x.revision});
  }
  console.log("R7 real sessions passed: swap preservation, accept-confirmed swaps, uncovered outcomes, ride updates, authority/direct writes, effective expiry, atomic rollback, capacity/reservations, competing requests and deadline/withdrawal/cancel/pickup races.");
}
