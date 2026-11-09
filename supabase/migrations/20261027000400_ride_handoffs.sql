-- R6: manual, per-child pickup, arrival and explicit guardian receipt.
-- A designated active guardian may also be the driver, but the two actions and
-- authorities remain separate. No external recipients or automatic completion.
alter table public.driver_assignments add constraint assignment_trip_key unique(id,ride_id,ride_revision);
alter table public.driver_assignments drop constraint driver_assignments_release_reason_check;
alter table public.driver_assignments add constraint driver_assignments_release_reason_check
  check (release_reason in ('cancelled','withdrawn','consent_revoked','invalidated','completed'));
alter table public.ride_riders add constraint rider_family_key unique(ride_id,child_id,family_id);
create table public.ride_trips (
  ride_id uuid primary key references public.rides(id),
  assignment_id uuid not null unique,
  ride_revision integer not null check (ride_revision>0),
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  foreign key(assignment_id,ride_id,ride_revision) references public.driver_assignments(id,ride_id,ride_revision),
  check (isfinite(started_at) and (completed_at is null or (isfinite(completed_at) and completed_at>=started_at)))
);
create table public.ride_handoffs (
  ride_id uuid not null,
  child_id uuid not null,
  family_id uuid not null,
  recipient_id uuid not null,
  recipient_name text not null check(length(btrim(recipient_name)) between 1 and 80),
  designated_by uuid not null,
  designated_at timestamptz not null default clock_timestamp(),
  version integer not null default 1 check(version>0),
  status text not null default 'scheduled' check(status in ('scheduled','picked_up','awaiting_handoff','completed')),
  picked_up_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  primary key(ride_id,child_id),
  foreign key(ride_id,child_id,family_id) references public.ride_riders(ride_id,child_id,family_id) on delete cascade,
  foreign key(family_id,recipient_id) references public.family_members(family_id,user_id),
  foreign key(family_id,designated_by) references public.family_members(family_id,user_id),
  check (isfinite(designated_at)),
  check ((status='scheduled' and picked_up_at is null and arrived_at is null and completed_at is null) or
    (status='picked_up' and picked_up_at is not null and arrived_at is null and completed_at is null) or
    (status='awaiting_handoff' and picked_up_at is not null and arrived_at is not null and completed_at is null) or
    (status='completed' and picked_up_at is not null and arrived_at is not null and completed_at is not null)),
  check ((picked_up_at is null or isfinite(picked_up_at)) and
    (arrived_at is null or (isfinite(arrived_at) and arrived_at>=picked_up_at)) and
    (completed_at is null or (isfinite(completed_at) and completed_at>=arrived_at)))
);
create index handoff_recipient on public.ride_handoffs(family_id,recipient_id,ride_id);
create table public.ride_events (
  request_id uuid primary key,
  ride_id uuid not null,
  child_id uuid not null,
  kind text not null check(kind in ('picked_up','awaiting_handoff','completed')),
  previous_version integer not null check(previous_version>0),
  actor_id uuid not null references public.profiles(id),
  actor_name text not null check(length(btrim(actor_name)) between 1 and 80),
  occurred_at timestamptz not null default clock_timestamp() check(isfinite(occurred_at)),
  unique(ride_id,child_id,kind),
  foreign key(ride_id,child_id) references public.ride_handoffs(ride_id,child_id),
  foreign key(ride_id) references public.ride_trips(ride_id)
);
create index events_history on public.ride_events(ride_id,occurred_at,child_id);

create function pool_private.designate_recipient(p_ride_id uuid,p_child_id uuid,p_recipient_id uuid,p_revision integer,p_version integer) returns integer
language plpgsql security definer set search_path='' as $$
declare a uuid:=pool_private.require_actor(); r public.rides; rr public.ride_riders; h public.ride_handoffs;
begin
  r:=pool_private.lock_driver_ride(p_ride_id);
  select * into rr from public.ride_riders where ride_id=r.id and child_id=p_child_id;
  if not found or not pool_private.participates(r.id,rr.family_id) then raise exception 'unavailable' using errcode='PT404'; end if;
  perform pool_private.check_ride_revision(r,p_revision);
  if exists(select 1 from public.ride_trips where ride_id=r.id) then raise exception 'trip_frozen' using errcode='PT423'; end if;
  if p_version is null or p_version<0 or p_recipient_id is null then raise exception 'validation' using errcode='PT400'; end if;
  if not exists(select 1 from public.family_members fm where fm.family_id=rr.family_id and fm.user_id=p_recipient_id and fm.removed_at is null)
    or not exists(select 1 from auth.users where id=p_recipient_id and email_confirmed_at is not null and not is_anonymous) then raise exception 'invalid_recipient' using errcode='PT422'; end if;
  select * into h from public.ride_handoffs where ride_id=r.id and child_id=rr.child_id;
  if found then
    if h.version=p_version+1 and h.recipient_id=p_recipient_id and h.designated_by=a then return h.version; end if;
    if h.version<>p_version then raise exception 'stale_recipient' using errcode='PT409'; end if;
    update public.ride_handoffs set recipient_id=p_recipient_id,recipient_name=(select display_name from public.profiles where id=p_recipient_id),designated_by=a,designated_at=clock_timestamp(),version=version+1
      where ride_id=r.id and child_id=rr.child_id returning version into p_version;
  else
    if p_version<>0 then raise exception 'stale_recipient' using errcode='PT409'; end if;
    insert into public.ride_handoffs(ride_id,child_id,family_id,recipient_id,recipient_name,designated_by) values(r.id,rr.child_id,rr.family_id,p_recipient_id,(select display_name from public.profiles where id=p_recipient_id),a) returning version into p_version;
  end if;
  return p_version;
end $$;

-- Called under family/circle/ride locks shared with membership and R4/R5 commands.
create function pool_private.start_trip(p_ride uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.rides; a public.driver_assignments; p public.driver_proposals; v public.vehicles;
begin
  select * into r from public.rides where id=p_ride;
  select * into a from public.driver_assignments where ride_id=r.id and released_at is null;
  select * into p from public.driver_proposals where id=a.proposal_id;
  if a.id is null or p.status<>'confirmed' or r.cancelled_at is not null or r.revision<>a.ride_revision or p.roster<>pool_private.ride_roster(r.id)
    or jsonb_array_length(p.roster)=0 then raise exception 'invalid_assignment' using errcode='PT409'; end if;
  if not pool_private.driver_is_member(r.circle_id,p.driver_family_id,a.driver_id) or exists(
    select 1 from public.ride_families where ride_id=r.id and (status='invited' or (status='joined' and not pool_private.ride_family_active(circle_id,family_id))))
    then raise exception 'membership_changed' using errcode='PT409'; end if;
  if exists(select 1 from public.ride_riders rr where rr.ride_id=r.id and not exists(
    select 1 from public.ride_driver_consents c join public.family_members fm on fm.family_id=c.family_id and fm.user_id=c.guardian_id
    where c.proposal_id=p.id and c.child_id=rr.child_id and c.family_id=rr.family_id and c.revoked_at is null and fm.removed_at is null))
    then raise exception 'consent_required' using errcode='PT422'; end if;
  if exists(select 1 from public.ride_riders rr where rr.ride_id=r.id and not exists(
    select 1 from public.ride_handoffs h join public.family_members fm on fm.family_id=h.family_id and fm.user_id=h.recipient_id
      join auth.users u on u.id=h.recipient_id
    where h.ride_id=rr.ride_id and h.child_id=rr.child_id and h.family_id=rr.family_id and h.status='scheduled'
      and fm.removed_at is null and u.email_confirmed_at is not null and not u.is_anonymous))
    then raise exception 'recipient_required' using errcode='PT422'; end if;
  perform 1 from public.profiles where id=a.driver_id for update;
  select * into v from public.vehicles where id=a.vehicle_id for update;
  if v.driver_id<>a.driver_id or v.version<>a.vehicle_version or v.retired_at is not null then raise exception 'stale_vehicle' using errcode='PT409'; end if;
  if p.accepted_at is null or not p.restraints_confirmed or p.available_seats is null or p.available_seats<jsonb_array_length(p.roster)
    or p.available_seats>v.passenger_seats then raise exception 'capacity_or_restraints' using errcode='PT422'; end if;
  -- Planned intervals may be adjacent while a real handoff runs late. Serialize
  -- starts on driver/vehicle and retain that responsibility until actual receipt.
  if exists(select 1 from public.ride_trips t join public.driver_assignments other on other.id=t.assignment_id
    where t.completed_at is null and (other.driver_id=a.driver_id or other.vehicle_id=a.vehicle_id))
    then raise exception 'unfinished_driver_or_vehicle_trip' using errcode='PT424'; end if;
  insert into public.ride_trips(ride_id,assignment_id,ride_revision) values(r.id,a.id,a.ride_revision);
end $$;

-- Only these three kinds exist. Actor, name, time, prior state and resulting
-- state are database-derived. There is no public append-event command.
create function pool_private.transition_child(p_request_id uuid,p_ride_id uuid,p_child_id uuid,p_revision integer,p_version integer,p_kind text) returns text
language plpgsql security definer set search_path='' as $$
declare actor uuid:=pool_private.require_actor(); r public.rides; h public.ride_handoffs; e public.ride_events; t timestamptz; prior text;
begin
  r:=pool_private.lock_driver_ride(p_ride_id);
  if not pool_private.can_read_ride(r.id) then raise exception 'unavailable' using errcode='PT404'; end if;
  select * into h from public.ride_handoffs where ride_id=r.id and child_id=p_child_id for update;
  if not found then raise exception 'recipient_required' using errcode='PT422'; end if;
  if p_kind in ('picked_up','awaiting_handoff') then
    if not pool_private.confirmed_driver(r.id) then raise exception 'unavailable' using errcode='PT404'; end if;
  elsif p_kind='completed' then
    if h.recipient_id<>actor or not pool_private.participates(r.id,h.family_id) then raise exception 'unavailable' using errcode='PT404'; end if;
  else raise exception 'validation' using errcode='PT400'; end if;
  if p_request_id is null or p_version is null or p_version<1 then raise exception 'validation' using errcode='PT400'; end if;
  perform pool_private.check_ride_revision(r,p_revision);
  select * into e from public.ride_events where request_id=p_request_id;
  if found and (e.ride_id<>r.id or e.child_id<>h.child_id or e.kind<>p_kind or e.actor_id<>actor or e.previous_version<>p_version)
    then raise exception 'request_reused' using errcode='PT409'; end if;
  select * into e from public.ride_events where ride_id=r.id and child_id=h.child_id and kind=p_kind;
  if found then
    if e.actor_id=actor and e.previous_version=p_version then return h.status; end if;
    raise exception 'stale_event' using errcode='PT409';
  end if;
  if h.version<>p_version then raise exception 'stale_progress' using errcode='PT409'; end if;
  prior:=case p_kind when 'picked_up' then 'scheduled' when 'awaiting_handoff' then 'picked_up' else 'awaiting_handoff' end;
  if h.status<>prior or exists(select 1 from public.ride_trips where ride_id=r.id and completed_at is not null)
    then raise exception 'invalid_transition' using errcode='PT409'; end if;
  if not exists(select 1 from public.ride_trips where ride_id=r.id) then
    if p_kind<>'picked_up' then raise exception 'invalid_transition' using errcode='PT409'; end if;
    perform pool_private.start_trip(r.id);
  end if;
  t:=clock_timestamp();
  insert into public.ride_events(request_id,ride_id,child_id,kind,previous_version,actor_id,actor_name,occurred_at)
    select p_request_id,r.id,h.child_id,p_kind,h.version,actor,display_name,t from public.profiles where id=actor;
  update public.ride_handoffs set status=p_kind,version=version+1,
    picked_up_at=case when p_kind='picked_up' then t else picked_up_at end,
    arrived_at=case when p_kind='awaiting_handoff' then t else arrived_at end,
    completed_at=case when p_kind='completed' then t else completed_at end where ride_id=r.id and child_id=h.child_id;
  if p_kind='completed' and not exists(select 1 from public.ride_handoffs where ride_id=r.id and status<>'completed') then
    update public.ride_trips set completed_at=t where ride_id=r.id;
    update public.driver_assignments set released_at=t,release_reason='completed' where ride_id=r.id and released_at is null;
  end if;
  return p_kind;
end $$;

-- A completed assignment still grants its current driver scoped trip history.
create or replace function pool_private.confirmed_driver(p_ride uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.driver_assignments a join public.driver_proposals p on p.id=a.proposal_id join public.rides r on r.id=a.ride_id
    where a.ride_id=p_ride and a.driver_id=pool_private.actor() and r.cancelled_at is null
    and (a.released_at is null or (a.release_reason='completed' and exists(select 1 from public.ride_trips t where t.assignment_id=a.id and t.completed_at is not null)))
    and pool_private.driver_is_member(r.circle_id,p.driver_family_id,p.driver_id))
$$;

create function pool_private.guard_trip_plan() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.ride_trips where ride_id=old.id) and new is distinct from old then raise exception 'trip_frozen' using errcode='PT423'; end if;
  return coalesce(new,old);
end $$;
create trigger active_trip_plan before update or delete on public.rides for each row execute function pool_private.guard_trip_plan();
create function pool_private.guard_trip_roster() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.ride_trips where ride_id=coalesce(new.ride_id,old.ride_id)) then raise exception 'trip_frozen' using errcode='PT423'; end if;
  return coalesce(new,old);
end $$;
create trigger active_trip_riders before insert or update or delete on public.ride_riders for each row execute function pool_private.guard_trip_roster();
create trigger active_trip_families before insert or update or delete on public.ride_families for each row execute function pool_private.guard_trip_roster();
create trigger active_trip_locations before insert or update or delete on public.ride_locations for each row execute function pool_private.guard_trip_roster();
-- Guard R5 commands even when they would otherwise silently succeed on a retry.
create or replace function pool_private.close_driver(p_ride uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.ride_trips where ride_id=p_ride) then raise exception 'trip_frozen' using errcode='PT423'; end if;
  update public.driver_proposals set status=p_reason,closed_at=clock_timestamp() where ride_id=p_ride and status in ('pending','confirmed');
  update public.driver_assignments set released_at=clock_timestamp(),release_reason=p_reason where ride_id=p_ride and released_at is null;
end $$;
create function pool_private.guard_trip_consent() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.ride_trips where ride_id=coalesce(new.ride_id,old.ride_id)) then raise exception 'trip_frozen' using errcode='PT423'; end if;
  return coalesce(new,old);
end $$;
create trigger active_trip_consents before insert or update or delete on public.ride_driver_consents for each row execute function pool_private.guard_trip_consent();

-- R3 commands hold the family root BEFORE writing membership. Taking circles
-- then rides here serializes against the first pickup without inverted locks.
-- Responsibility lasts until actual completion, regardless of scheduled end.
create function pool_private.guard_trip_membership() returns trigger language plpgsql security definer set search_path='' as $$
declare c uuid;
begin
  if old.removed_at is not null or new.removed_at is null then return new; end if;
  for c in select id from public.circles where id in (select circle_id from public.circle_families where family_id=new.family_id
    and (tg_table_name='family_members' or circle_id=(to_jsonb(new)->>'circle_id')::uuid)) order by id loop
    perform 1 from public.circles where id=c for update;
    perform 1 from public.rides where circle_id=c order by id for update;
    if exists(select 1 from public.ride_trips t join public.rides r on r.id=t.ride_id
      join public.driver_assignments a on a.id=t.assignment_id join public.driver_proposals p on p.id=a.proposal_id
      where r.circle_id=c and t.completed_at is null and
      case when tg_table_name='circle_families' then
        p.driver_family_id=new.family_id or exists(select 1 from public.ride_riders rr where rr.ride_id=r.id and rr.family_id=new.family_id)
      else
        (p.driver_family_id=new.family_id and p.driver_id=(to_jsonb(new)->>'user_id')::uuid) or
        exists(select 1 from public.ride_handoffs h where h.ride_id=r.id and h.family_id=new.family_id and h.recipient_id=(to_jsonb(new)->>'user_id')::uuid) or
        exists(select 1 from public.ride_driver_consents dc where dc.proposal_id=p.id and dc.family_id=new.family_id and dc.guardian_id=(to_jsonb(new)->>'user_id')::uuid and dc.revoked_at is null)
      end) then raise exception 'active_trip_responsibility' using errcode='PT423'; end if;
  end loop;
  return new;
end $$;
create trigger active_trip_guardian before update on public.family_members for each row execute function pool_private.guard_trip_membership();
create trigger active_trip_circle_family before update on public.circle_families for each row execute function pool_private.guard_trip_membership();

create function pool_private.immutable_ride_event() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'append_only_event' using errcode='PT423'; end $$;
create trigger immutable_event before update or delete on public.ride_events for each row execute function pool_private.immutable_ride_event();
alter table public.ride_trips enable row level security;
alter table public.ride_handoffs enable row level security;
alter table public.ride_events enable row level security;
revoke all on public.ride_trips,public.ride_handoffs,public.ride_events from public,anon,authenticated;
grant select on public.ride_trips,public.ride_handoffs,public.ride_events to authenticated;
create policy trip_read on public.ride_trips for select to authenticated using(pool_private.can_read_ride(ride_id));
create policy handoff_read on public.ride_handoffs for select to authenticated using(pool_private.can_read_ride(ride_id));
create policy event_read on public.ride_events for select to authenticated using(pool_private.can_read_ride(ride_id));

create function public.designate_recipient(p_ride_id uuid,p_child_id uuid,p_recipient_id uuid,p_revision integer,p_version integer) returns integer
language sql security invoker set search_path='' as $$ select pool_private.designate_recipient(p_ride_id,p_child_id,p_recipient_id,p_revision,p_version) $$;
create function public.record_pickup(p_request_id uuid,p_ride_id uuid,p_child_id uuid,p_revision integer,p_version integer) returns text
language sql security invoker set search_path='' as $$ select pool_private.transition_child(p_request_id,p_ride_id,p_child_id,p_revision,p_version,'picked_up') $$;
create function public.report_arrival(p_request_id uuid,p_ride_id uuid,p_child_id uuid,p_revision integer,p_version integer) returns text
language sql security invoker set search_path='' as $$ select pool_private.transition_child(p_request_id,p_ride_id,p_child_id,p_revision,p_version,'awaiting_handoff') $$;
create function public.confirm_handoff(p_request_id uuid,p_ride_id uuid,p_child_id uuid,p_revision integer,p_version integer) returns text
language sql security invoker set search_path='' as $$ select pool_private.transition_child(p_request_id,p_ride_id,p_child_id,p_revision,p_version,'completed') $$;

create or replace function pool_private.invalidate_driver_membership() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_circle uuid; v_ride uuid;
begin
  if old.removed_at is not null or new.removed_at is null then return new; end if;
  for v_circle in select id from public.circles where id in (
    select circle_id from public.circle_families where family_id=new.family_id
      and (tg_table_name='family_members' or circle_id=(to_jsonb(new)->>'circle_id')::uuid)) order by id loop
    perform 1 from public.circles where id=v_circle for update;
    for v_ride in select r.id from public.rides r where r.circle_id=v_circle and r.ends_at>clock_timestamp() and not exists(select 1 from public.ride_trips where ride_id=r.id) and exists(
      select 1 from public.driver_proposals p where p.ride_id=r.id and p.status in ('pending','confirmed') and
      (case when tg_table_name='circle_families' then
        v_circle=(to_jsonb(new)->>'circle_id')::uuid and (p.driver_family_id=new.family_id or exists(select 1 from public.ride_families rf where rf.ride_id=r.id and rf.family_id=new.family_id and rf.status='joined'))
      else (p.driver_family_id=new.family_id and p.driver_id=(to_jsonb(new)->>'user_id')::uuid) or exists(
        select 1 from public.ride_driver_consents c where c.proposal_id=p.id and c.family_id=new.family_id and c.guardian_id=(to_jsonb(new)->>'user_id')::uuid and c.revoked_at is null) end)) order by r.id loop
      perform 1 from public.rides where id=v_ride for update;
      perform pool_private.close_driver(v_ride,'invalidated');
      update public.rides set revision=revision+1 where id=v_ride;
    end loop;
  end loop;
  return new;
end $$;

create or replace function pool_private.driver_status(p_ride_ids uuid[],p_driver_only boolean,p_pending_only boolean,p_after_start timestamptz,p_after_id uuid,p_limit integer) returns table(proposal_id uuid,ride_id uuid,ride_revision integer,driver_id uuid,driver_name text,vehicle_id uuid,vehicle_label text,vehicle_version integer,passenger_seats integer,available_seats integer,restraints_confirmed boolean,accepted_at timestamptz,deadline timestamptz,proposal_status text,coverage text,rider_count integer,booster_count integer,child_seat_count integer,consent_count integer,pickup_summary text,destination_summary text,starts_at timestamptz,ends_at timestamptz,timezone text,is_driver boolean,cancelled_at timestamptz) language plpgsql security definer set search_path = '' as $$
begin
  perform pool_private.require_actor();
  if p_driver_only is null or p_pending_only is null or p_limit is null or p_limit not between 1 and 1000
    or (p_ride_ids is null and not p_driver_only)
    or (p_ride_ids is not null and (cardinality(p_ride_ids)>1000 or cardinality(p_ride_ids)<>(select count(distinct x) from unnest(p_ride_ids) x)))
    or ((p_after_start is null)<>(p_after_id is null)) or (p_after_start is not null and not isfinite(p_after_start)) then raise exception 'validation' using errcode='PT400'; end if;
  return query select p.id,r.id,p.ride_revision,p.driver_id,pr.display_name,v.id,v.label,p.vehicle_version,v.passenger_seats,p.available_seats,p.restraints_confirmed,p.accepted_at,p.deadline,
    case when p.status='pending' and p.deadline<=clock_timestamp() then 'expired' else p.status end,
    case when exists(select 1 from public.ride_trips t join public.driver_assignments a on a.id=t.assignment_id where a.proposal_id=p.id and t.completed_at is not null) then 'confirmed' when exists(select 1 from public.driver_assignments a where a.proposal_id=p.id and a.released_at is null) then 'confirmed'
      when p.status='pending' and p.deadline>clock_timestamp() then 'awaiting_confirmation' else 'needs_driver' end,
    jsonb_array_length(p.roster),
    (select count(*)::integer from jsonb_array_elements(p.roster) x where x->>'seat'='booster'),
    (select count(*)::integer from jsonb_array_elements(p.roster) x where x->>'seat'='child-seat'),
    (select count(*)::integer from public.ride_driver_consents c where c.proposal_id=p.id and c.revoked_at is null),
    r.pickup_summary,r.destination_summary,r.starts_at,r.ends_at,r.timezone,p.driver_id=pool_private.actor(),r.cancelled_at
    from public.driver_proposals p join public.rides r on r.id=p.ride_id join public.vehicles v on v.id=p.vehicle_id join public.profiles pr on pr.id=p.driver_id
    where (p_ride_ids is null or r.id=any(p_ride_ids))
      and (not p_driver_only or p.driver_id=pool_private.actor())
      and (not p_pending_only or (p.status='pending' and p.deadline>clock_timestamp()))
      and (p_after_start is null or (r.starts_at,r.id)>(p_after_start,p_after_id)) and
      (exists(select 1 from public.ride_families rf where rf.ride_id=r.id and pool_private.participates(r.id,rf.family_id)) or
       (p.driver_id=pool_private.actor() and pool_private.driver_is_member(r.circle_id,p.driver_family_id,p.driver_id)))
      and p.id=(select newest.id from public.driver_proposals newest where newest.ride_id=r.id order by newest.ride_revision desc limit 1)
    order by r.starts_at,r.id limit p_limit;
end $$;

revoke all on function pool_private.designate_recipient(uuid,uuid,uuid,integer,integer) from public,anon,authenticated;
revoke all on function pool_private.start_trip(uuid) from public,anon,authenticated;
revoke all on function pool_private.transition_child(uuid,uuid,uuid,integer,integer,text) from public,anon,authenticated;
revoke all on function pool_private.guard_trip_plan() from public,anon,authenticated;
revoke all on function pool_private.guard_trip_roster() from public,anon,authenticated;
revoke all on function pool_private.guard_trip_consent() from public,anon,authenticated;
revoke all on function pool_private.guard_trip_membership() from public,anon,authenticated;
revoke all on function pool_private.immutable_ride_event() from public,anon,authenticated;
revoke all on function public.designate_recipient(uuid,uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.designate_recipient(uuid,uuid,uuid,integer,integer) to authenticated;
revoke all on function public.record_pickup(uuid,uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.record_pickup(uuid,uuid,uuid,integer,integer) to authenticated;
revoke all on function public.report_arrival(uuid,uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.report_arrival(uuid,uuid,uuid,integer,integer) to authenticated;
revoke all on function public.confirm_handoff(uuid,uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.confirm_handoff(uuid,uuid,uuid,integer,integer) to authenticated;
grant execute on function pool_private.designate_recipient(uuid,uuid,uuid,integer,integer) to authenticated;
grant execute on function pool_private.transition_child(uuid,uuid,uuid,integer,integer,text) to authenticated;

-- Keyset-paginated attention does not discard an unfinished trip when its planned
-- interval passes. Current membership and exact-trip visibility are mandatory.
create function pool_private.trip_attention(p_after_id uuid,p_limit integer) returns table(ride_id uuid,pickup_summary text,destination_summary text,started_at timestamptz,awaiting_count integer,missing_recipient_count integer,is_driver boolean)
language plpgsql security definer set search_path='' as $$
begin
  perform pool_private.require_actor();
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'validation' using errcode='PT400'; end if;
  return query select r.id,r.pickup_summary,r.destination_summary,t.started_at,
    (select count(*)::integer from public.ride_handoffs h where h.ride_id=r.id and h.status='awaiting_handoff'),
    (select count(*)::integer from public.ride_riders rr where rr.ride_id=r.id and not exists(
      select 1 from public.ride_handoffs h join public.family_members fm on fm.family_id=h.family_id and fm.user_id=h.recipient_id
        where h.ride_id=rr.ride_id and h.child_id=rr.child_id and fm.removed_at is null)),
    pool_private.confirmed_driver(r.id)
  from public.rides r join public.driver_assignments a on a.ride_id=r.id and a.released_at is null
    left join public.ride_trips t on t.ride_id=r.id
  where r.cancelled_at is null and t.completed_at is null and pool_private.can_read_ride(r.id)
    and (p_after_id is null or r.id>p_after_id)
  order by r.id limit p_limit;
end $$;
create function public.trip_attention(p_after_id uuid default null,p_limit integer default 26) returns table(ride_id uuid,pickup_summary text,destination_summary text,started_at timestamptz,awaiting_count integer,missing_recipient_count integer,is_driver boolean)
language sql security invoker set search_path='' as $$ select * from pool_private.trip_attention(p_after_id,p_limit) $$;
revoke all on function pool_private.trip_attention(uuid,integer),public.trip_attention(uuid,integer) from public,anon,authenticated;
grant execute on function pool_private.trip_attention(uuid,integer),public.trip_attention(uuid,integer) to authenticated;
