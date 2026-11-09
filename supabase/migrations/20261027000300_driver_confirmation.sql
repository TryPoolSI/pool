-- R5: initial assignments only. Prior migrations remain immutable.
create extension if not exists btree_gist with schema extensions;
create table public.vehicles (
  id uuid primary key,
  driver_id uuid not null references public.profiles(id),
  label text not null check (length(btrim(label)) between 1 and 80),
  passenger_seats integer not null check (passenger_seats between 1 and 50),
  version integer not null default 1 check (version > 0),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  unique(id, driver_id)
);
create index vehicles_driver on public.vehicles(driver_id);
create table public.driver_proposals (
  id uuid primary key,
  ride_id uuid not null references public.rides(id),
  ride_revision integer not null check (ride_revision > 0),
  nominated_by uuid not null references public.profiles(id),
  nominating_family_id uuid not null references public.families(id),
  driver_id uuid not null,
  driver_family_id uuid not null,
  vehicle_id uuid not null,
  vehicle_version integer not null check (vehicle_version > 0),
  -- Immutable child/family/seat snapshot; never exposed to proposed-only drivers.
  roster jsonb not null check (jsonb_typeof(roster) = 'array' and jsonb_array_length(roster) > 0),
  deadline timestamptz not null check (isfinite(deadline)),
  status text not null default 'pending' check (status in ('pending','confirmed','declined','cancelled','expired','withdrawn','consent_revoked','invalidated')),
  accepted_at timestamptz,
  available_seats integer check (available_seats between 1 and 50),
  restraints_confirmed boolean not null default false,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (driver_family_id, driver_id) references public.family_members(family_id, user_id),
  foreign key (vehicle_id, driver_id) references public.vehicles(id, driver_id),
  check ((accepted_at is null and available_seats is null and not restraints_confirmed) or
         (accepted_at is not null and available_seats is not null and restraints_confirmed)),
  check ((status = 'pending') = (closed_at is null)),
  unique(id, ride_id, ride_revision, driver_id, vehicle_id, vehicle_version)
);
create unique index one_pending_driver on public.driver_proposals(ride_id) where status = 'pending';
create index proposals_ride_history on public.driver_proposals(ride_id,ride_revision desc);
create index proposals_driver on public.driver_proposals(driver_id, ride_id);
create index proposals_vehicle on public.driver_proposals(vehicle_id);
create table public.ride_driver_consents (
  proposal_id uuid not null,
  ride_id uuid not null,
  ride_revision integer not null,
  driver_id uuid not null,
  vehicle_id uuid not null,
  vehicle_version integer not null,
  child_id uuid not null,
  family_id uuid not null,
  guardian_id uuid not null,
  consented_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  primary key(proposal_id, child_id),
  foreign key (proposal_id, ride_id, ride_revision, driver_id, vehicle_id, vehicle_version)
    references public.driver_proposals(id, ride_id, ride_revision, driver_id, vehicle_id, vehicle_version),
  foreign key (child_id, family_id) references public.children(id, family_id),
  foreign key (family_id, guardian_id) references public.family_members(family_id, user_id)
);
create index consents_ride_family on public.ride_driver_consents(ride_id,family_id);
create index consents_family on public.ride_driver_consents(family_id, guardian_id);
create table public.driver_assignments (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null unique,
  ride_id uuid not null,
  ride_revision integer not null,
  driver_id uuid not null,
  vehicle_id uuid not null,
  vehicle_version integer not null,
  starts_at timestamptz not null check (isfinite(starts_at)),
  ends_at timestamptz not null check (isfinite(ends_at) and ends_at > starts_at),
  confirmed_at timestamptz not null default clock_timestamp(),
  released_at timestamptz,
  release_reason text check (release_reason in ('cancelled','withdrawn','consent_revoked','invalidated')),
  check ((released_at is null) = (release_reason is null)),
  foreign key (proposal_id, ride_id, ride_revision, driver_id, vehicle_id, vehicle_version)
    references public.driver_proposals(id, ride_id, ride_revision, driver_id, vehicle_id, vehicle_version),
  -- Database exclusion constraints arbitrate concurrent different-ride finalizers.
  exclude using gist (driver_id extensions.gist_uuid_ops with =, tstzrange(starts_at, ends_at, '[)') with &&) where (released_at is null),
  exclude using gist (vehicle_id extensions.gist_uuid_ops with =, tstzrange(starts_at, ends_at, '[)') with &&) where (released_at is null)
);
create unique index one_active_assignment on public.driver_assignments(ride_id) where released_at is null;

create function pool_private.owns_vehicle(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.vehicles where id=p_id and driver_id=pool_private.actor())
$$;
create function pool_private.driver_is_member(p_circle uuid, p_family uuid, p_driver uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select pool_private.ride_family_active(p_circle,p_family) and exists(select 1 from public.family_members
    where family_id=p_family and user_id=p_driver and removed_at is null)
$$;
create function pool_private.confirmed_driver(p_ride uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.driver_assignments a join public.driver_proposals p on p.id=a.proposal_id join public.rides r on r.id=a.ride_id
    where a.ride_id=p_ride and a.driver_id=pool_private.actor() and a.released_at is null and r.cancelled_at is null
      and pool_private.driver_is_member(r.circle_id,p.driver_family_id,p.driver_id))
$$;
-- Extend R4's private-detail helper, preserving family privacy and current membership.
create or replace function pool_private.can_read_ride(p_ride uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.ride_families rf where rf.ride_id=p_ride and rf.status='joined'
    and pool_private.member_of(rf.family_id) and pool_private.ride_family_active(rf.circle_id,rf.family_id)) or pool_private.confirmed_driver(p_ride)
$$;
create function pool_private.participates(p_ride uuid, p_family uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.ride_families rf where rf.ride_id=p_ride and rf.family_id=p_family and rf.status='joined'
    and pool_private.member_of(rf.family_id) and pool_private.ride_family_active(rf.circle_id,rf.family_id))
$$;
create function pool_private.ride_roster(p_ride uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('child',child_id,'family',family_id,'seat',seat_requirement) order by child_id),'[]'::jsonb)
    from public.ride_riders where ride_id=p_ride
$$;
-- R3 lock order: ALL affected family roots in UUID order, circle, ride, driver profile, vehicle.
-- The driver family is explicit and frozen; do not silently substitute membership.
create function pool_private.lock_driver_ride(p_ride uuid,p_driver_family uuid default null) returns public.rides language plpgsql security definer set search_path = '' as $$
declare v_ride public.rides;
begin
  perform pool_private.require_actor();
  perform 1 from public.families where id in (
    select family_id from public.ride_families where ride_id=p_ride
    union select driver_family_id from public.driver_proposals where ride_id=p_ride and status in ('pending','confirmed')
    union select p_driver_family) order by id for update;
  select * into v_ride from public.rides where id=p_ride;
  if not found then raise exception 'unavailable' using errcode='PT404'; end if;
  perform 1 from public.circles where id=v_ride.circle_id for update;
  select * into v_ride from public.rides where id=p_ride for update;
  return v_ride;
end $$;
create function pool_private.close_driver(p_ride uuid,p_reason text) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.driver_proposals set status=p_reason,closed_at=clock_timestamp() where ride_id=p_ride and status in ('pending','confirmed');
  update public.driver_assignments set released_at=clock_timestamp(),release_reason=p_reason where ride_id=p_ride and released_at is null;
end $$;
create function pool_private.expire_driver(p_ride uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.driver_proposals set status='expired',closed_at=clock_timestamp() where ride_id=p_ride and status='pending' and deadline<=clock_timestamp();
end $$;
create function pool_private.save_vehicle(p_id uuid,p_label text,p_passenger_seats integer,p_version integer,p_retire boolean) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=pool_private.require_actor(); v_vehicle public.vehicles;
begin
  -- A profile is established through family onboarding; no fabricated directory identities.
  if not exists(select 1 from public.profiles where id=v_actor) then raise exception 'unavailable' using errcode='PT404'; end if;
  if p_id is null or p_label is null or length(btrim(p_label)) not between 1 and 80 or p_passenger_seats is null or p_passenger_seats not between 1 and 50 or p_version is null or p_retire is null then raise exception 'validation' using errcode='PT400'; end if;
  select * into v_vehicle from public.vehicles where id=p_id for update;
  if found then
    if v_vehicle.driver_id<>v_actor then raise exception 'unavailable' using errcode='PT404'; end if;
    if p_version=0 and v_vehicle.version=1 and v_vehicle.label=btrim(p_label) and v_vehicle.passenger_seats=p_passenger_seats and not p_retire and v_vehicle.retired_at is null then return p_id; end if;
    if v_vehicle.version<>p_version then raise exception 'stale_vehicle' using errcode='PT409'; end if;
    if exists(select 1 from public.driver_proposals where vehicle_id=p_id and status='pending' and deadline>clock_timestamp())
      or exists(select 1 from public.driver_assignments where vehicle_id=p_id and released_at is null) then raise exception 'vehicle_in_use' using errcode='PT423'; end if;
    update public.vehicles set label=btrim(p_label),passenger_seats=p_passenger_seats,version=version+1,
      retired_at=case when p_retire then clock_timestamp() else null end where id=p_id;
  else
    if p_version<>0 or p_retire then raise exception 'stale_vehicle' using errcode='PT409'; end if;
    insert into public.vehicles(id,driver_id,label,passenger_seats) values(p_id,v_actor,btrim(p_label),p_passenger_seats);
  end if;
  return p_id;
end $$;
create function pool_private.propose_driver(p_id uuid,p_ride_id uuid,p_family_id uuid,p_revision integer,p_driver_id uuid,p_driver_family_id uuid,p_vehicle_id uuid,p_vehicle_version integer) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=pool_private.require_actor(); v_ride public.rides; v_vehicle public.vehicles; v_existing public.driver_proposals;
begin
  v_ride:=pool_private.lock_driver_ride(p_ride_id,p_driver_family_id);
  if not pool_private.participates(p_ride_id,p_family_id) then raise exception 'unavailable' using errcode='PT404'; end if;
  select * into v_existing from public.driver_proposals where id=p_id;
  if found then
    if v_existing.nominated_by<>v_actor or v_existing.ride_id<>p_ride_id then raise exception 'unavailable' using errcode='PT404'; end if;
    if v_existing.driver_id=p_driver_id and v_existing.driver_family_id=p_driver_family_id and v_existing.vehicle_id=p_vehicle_id and v_existing.vehicle_version=p_vehicle_version
      and v_existing.nominating_family_id=p_family_id and v_existing.ride_revision=p_revision+1 then return p_id; end if;
    raise exception 'duplicate_request' using errcode='PT409';
  end if;
  perform pool_private.check_ride_revision(v_ride,p_revision);
  perform pool_private.expire_driver(p_ride_id);
  if v_ride.starts_at<=clock_timestamp() then raise exception 'expired' using errcode='PT410'; end if;
  if exists(select 1 from public.driver_assignments where ride_id=p_ride_id and released_at is null)
    or exists(select 1 from public.driver_proposals where ride_id=p_ride_id and status='pending') then raise exception 'already_assigned_or_pending' using errcode='PT409'; end if;
  if not pool_private.driver_is_member(v_ride.circle_id,p_driver_family_id,p_driver_id) then raise exception 'unavailable' using errcode='PT404'; end if;
  if exists(select 1 from public.ride_families where ride_id=p_ride_id and
    (status='invited' or (status='joined' and not pool_private.ride_family_active(circle_id,family_id))))
    or not exists(select 1 from public.ride_riders where ride_id=p_ride_id) then raise exception 'roster_not_ready' using errcode='PT422'; end if;
  -- Proposal FKs also reference the nominating profile. Take both profile
  -- locks before the vehicle, matching finalization even for self nomination.
  perform 1 from public.profiles where id in (v_actor,p_driver_id) order by id for update;
  select * into v_vehicle from public.vehicles where id=p_vehicle_id for update;
  if not found or v_vehicle.driver_id<>p_driver_id or v_vehicle.retired_at is not null then raise exception 'unavailable' using errcode='PT404'; end if;
  if v_vehicle.version<>p_vehicle_version then raise exception 'stale_vehicle' using errcode='PT409'; end if;
  if v_vehicle.passenger_seats<(select count(*) from public.ride_riders where ride_id=p_ride_id) then raise exception 'insufficient_seats' using errcode='PT422'; end if;
  update public.rides set revision=revision+1 where id=p_ride_id returning revision into p_revision;
  insert into public.driver_proposals(id,ride_id,ride_revision,nominated_by,nominating_family_id,driver_id,driver_family_id,vehicle_id,vehicle_version,roster,deadline)
    values(p_id,p_ride_id,p_revision,v_actor,p_family_id,p_driver_id,p_driver_family_id,p_vehicle_id,p_vehicle_version,pool_private.ride_roster(p_ride_id),v_ride.starts_at);
  return p_id;
end $$;
-- Called only under the scope/ride locks. Every final reply repeats ALL checks.
create function pool_private.finalize_driver(p_id uuid) returns text language plpgsql security definer set search_path = '' as $$
declare p public.driver_proposals; r public.rides; v public.vehicles;
begin
  select * into p from public.driver_proposals where id=p_id;
  select * into r from public.rides where id=p.ride_id;
  if p.status<>'pending' then return p.status; end if;
  if p.deadline<=clock_timestamp() then raise exception 'expired' using errcode='PT410'; end if;
  if r.cancelled_at is not null or p.ride_revision<>r.revision or p.roster<>pool_private.ride_roster(r.id) then raise exception 'stale_plan' using errcode='PT409'; end if;
  if not pool_private.driver_is_member(r.circle_id,p.driver_family_id,p.driver_id)
    or exists(select 1 from public.ride_families where ride_id=r.id and (status='invited' or (status='joined' and not pool_private.ride_family_active(circle_id,family_id)))) then raise exception 'membership_changed' using errcode='PT409'; end if;
  perform 1 from public.profiles where id=p.driver_id for update;
  select * into v from public.vehicles where id=p.vehicle_id for update;
  if p.deadline<=clock_timestamp() then raise exception 'expired' using errcode='PT410'; end if;
  if v.driver_id<>p.driver_id or v.version<>p.vehicle_version or v.retired_at is not null then raise exception 'stale_vehicle' using errcode='PT409'; end if;
  if v.passenger_seats<jsonb_array_length(p.roster) then raise exception 'insufficient_seats' using errcode='PT422'; end if;
  if p.accepted_at is null or exists(select 1 from public.ride_riders rr where rr.ride_id=r.id and not exists(
    select 1 from public.ride_driver_consents c join public.family_members fm on fm.family_id=c.family_id and fm.user_id=c.guardian_id
      where c.proposal_id=p.id and c.child_id=rr.child_id and c.family_id=rr.family_id and c.revoked_at is null and fm.removed_at is null)) then return 'awaiting_confirmation'; end if;
  if not p.restraints_confirmed or p.available_seats<jsonb_array_length(p.roster) or p.available_seats>v.passenger_seats then raise exception 'capacity_or_restraints' using errcode='PT422'; end if;
  if p.deadline<=clock_timestamp() then raise exception 'expired' using errcode='PT410'; end if;
  -- The INSERT (including exclusion constraints) and the reply commit together.
  begin
    insert into public.driver_assignments(proposal_id,ride_id,ride_revision,driver_id,vehicle_id,vehicle_version,starts_at,ends_at)
      values(p.id,r.id,r.revision,p.driver_id,p.vehicle_id,p.vehicle_version,r.starts_at,r.ends_at);
  exception when exclusion_violation then raise exception 'driver_or_vehicle_reserved' using errcode='PT424';
  end;
  -- An exclusion check may itself wait for another reservation to release.
  if p.deadline<=clock_timestamp() then raise exception 'expired' using errcode='PT410'; end if;
  update public.driver_proposals set status='confirmed',closed_at=clock_timestamp() where id=p.id;
  return 'confirmed';
end $$;
create function pool_private.reply_driver(p_id uuid,p_revision integer,p_action text,p_family_id uuid,p_child_ids uuid[],p_available_seats integer,p_restraints boolean) returns text language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=pool_private.require_actor(); p public.driver_proposals; r public.rides;
begin
  select * into p from public.driver_proposals where id=p_id;
  if not found then raise exception 'unavailable' using errcode='PT404'; end if;
  r:=pool_private.lock_driver_ride(p.ride_id);
  select * into p from public.driver_proposals where id=p_id for update;
  -- Authorize before revealing status/deadline/revisions.
  if p_action in ('accept','decline','withdraw') then
    if p.driver_id<>v_actor or not pool_private.driver_is_member(r.circle_id,p.driver_family_id,v_actor) then raise exception 'unavailable' using errcode='PT404'; end if;
  elsif p_action in ('consent','revoke','cancel') then
    if not pool_private.participates(r.id,p_family_id) then raise exception 'unavailable' using errcode='PT404'; end if;
  else raise exception 'validation' using errcode='PT400'; end if;
  if p_revision is null or p.ride_revision<>p_revision then raise exception 'stale_proposal' using errcode='PT409'; end if;
  if p_action in ('withdraw','revoke','cancel') then
    if p_action='revoke' then
      if p_child_ids is null or cardinality(p_child_ids)=0 or cardinality(p_child_ids)<>(select count(distinct x) from unnest(p_child_ids) x)
        or exists(select 1 from unnest(p_child_ids) x where not exists(select 1 from public.ride_driver_consents c where c.proposal_id=p.id and c.child_id=x and c.family_id=p_family_id)) then raise exception 'invalid_own_children' using errcode='PT400'; end if;
      update public.ride_driver_consents set revoked_at=coalesce(revoked_at,clock_timestamp()) where proposal_id=p.id and child_id=any(p_child_ids) and family_id=p_family_id;
    end if;
    if p_action='cancel' and p.status='confirmed' then raise exception 'withdraw_or_revoke_first' using errcode='PT409'; end if;
    if p.status in ('pending','confirmed') then
      perform pool_private.close_driver(r.id,case p_action when 'withdraw' then 'withdrawn' when 'revoke' then 'consent_revoked' else 'cancelled' end);
      update public.rides set revision=revision+1 where id=r.id;
    end if;
    return case p_action when 'withdraw' then 'withdrawn' when 'revoke' then 'consent_revoked' else 'cancelled' end;
  end if;
  if r.cancelled_at is not null or r.revision<>p_revision then raise exception 'stale_or_cancelled' using errcode='PT409'; end if;
  if p.status not in ('pending','confirmed') then raise exception 'closed_proposal' using errcode='PT409'; end if;
  -- An already confirmed identical retry is harmless, even after the reply deadline.
  if p.status='pending' and p.deadline<=clock_timestamp() then raise exception 'expired' using errcode='PT410'; end if;
  if p_action='accept' then
    if p_available_seats is null or p_available_seats not between jsonb_array_length(p.roster) and 50 or p_restraints is distinct from true then raise exception 'capacity_or_restraints' using errcode='PT422'; end if;
    if p.accepted_at is not null and p.available_seats<>p_available_seats then raise exception 'different_reply' using errcode='PT409'; end if;
    if p_available_seats>(select passenger_seats from public.vehicles where id=p.vehicle_id) then raise exception 'insufficient_seats' using errcode='PT422'; end if;
    update public.driver_proposals set accepted_at=coalesce(accepted_at,clock_timestamp()),available_seats=p_available_seats,restraints_confirmed=true where id=p.id;
  elsif p_action='consent' then
    if p_child_ids is null or cardinality(p_child_ids)=0 or cardinality(p_child_ids)>50 or cardinality(p_child_ids)<>(select count(distinct x) from unnest(p_child_ids) x)
      or exists(select 1 from unnest(p_child_ids) x where not exists(select 1 from public.ride_riders rr where rr.ride_id=r.id and rr.child_id=x and rr.family_id=p_family_id)) then raise exception 'invalid_own_children' using errcode='PT400'; end if;
    insert into public.ride_driver_consents(proposal_id,ride_id,ride_revision,driver_id,vehicle_id,vehicle_version,child_id,family_id,guardian_id)
      select p.id,r.id,p.ride_revision,p.driver_id,p.vehicle_id,p.vehicle_version,x,p_family_id,v_actor from unnest(p_child_ids) x on conflict(proposal_id,child_id) do nothing;
  else
    if p.status<>'pending' then raise exception 'closed_proposal' using errcode='PT409'; end if;
    update public.driver_proposals set status='declined',closed_at=clock_timestamp() where id=p.id;
    update public.rides set revision=revision+1 where id=r.id;
    return 'declined';
  end if;
  return pool_private.finalize_driver(p.id);
end $$;

-- Guard inherited R4 entry points as well as the new commands.
create function pool_private.guard_frozen_roster() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_ride uuid:=coalesce(new.ride_id,old.ride_id);
begin
  if exists(select 1 from public.driver_proposals where ride_id=v_ride and status='pending' and deadline>clock_timestamp())
    or exists(select 1 from public.driver_assignments where ride_id=v_ride and released_at is null) then raise exception 'resolve_driver_before_roster_change' using errcode='PT423'; end if;
  return coalesce(new,old);
end $$;
create trigger frozen_riders before insert or update or delete on public.ride_riders for each row execute function pool_private.guard_frozen_roster();
create trigger frozen_families before update or delete on public.ride_families for each row execute function pool_private.guard_frozen_roster();
create function pool_private.guard_driver_plan() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.cancelled_at is not null and old.cancelled_at is null then perform pool_private.close_driver(old.id,'cancelled');
  elsif (new.starts_at,new.ends_at,new.timezone,new.pickup_summary,new.destination_summary,new.direction,new.revision)
    is distinct from (old.starts_at,old.ends_at,old.timezone,old.pickup_summary,old.destination_summary,old.direction,old.revision) and
    (exists(select 1 from public.driver_proposals where ride_id=old.id and status='pending' and deadline>clock_timestamp()) or
     exists(select 1 from public.driver_assignments where ride_id=old.id and released_at is null)) then raise exception 'resolve_driver_before_plan_change' using errcode='PT423'; end if;
  return new;
end $$;
create trigger driver_plan before update on public.rides for each row execute function pool_private.guard_driver_plan();
create trigger frozen_locations before update or delete on public.ride_locations for each row execute function pool_private.guard_frozen_roster();

-- Membership removals already hold the affected family root. Lock circles/rides
-- in order, close coverage and bump revision in the SAME removal transaction.
create function pool_private.invalidate_driver_membership() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_circle uuid; v_ride uuid;
begin
  if old.removed_at is not null or new.removed_at is null then return new; end if;
  for v_circle in select id from public.circles where id in (
    select circle_id from public.circle_families where family_id=new.family_id
      and (tg_table_name='family_members' or circle_id=(to_jsonb(new)->>'circle_id')::uuid)) order by id loop
    perform 1 from public.circles where id=v_circle for update;
    for v_ride in select r.id from public.rides r where r.circle_id=v_circle and r.ends_at>clock_timestamp() and exists(
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
create trigger driver_guardian_removed after update on public.family_members for each row execute function pool_private.invalidate_driver_membership();
create trigger driver_circle_family_removed after update on public.circle_families for each row execute function pool_private.invalidate_driver_membership();

alter table public.vehicles enable row level security;
alter table public.driver_proposals enable row level security;
alter table public.ride_driver_consents enable row level security;
alter table public.driver_assignments enable row level security;
revoke all on public.vehicles,public.driver_proposals,public.ride_driver_consents,public.driver_assignments from public,anon,authenticated;
grant select on public.vehicles,public.driver_proposals,public.ride_driver_consents,public.driver_assignments to authenticated;
create policy own_vehicle on public.vehicles for select to authenticated using (pool_private.owns_vehicle(id));
create policy participant_proposal on public.driver_proposals for select to authenticated using (
  exists(select 1 from public.ride_families rf where rf.ride_id=driver_proposals.ride_id and pool_private.participates(rf.ride_id,rf.family_id)));
create policy own_child_consent on public.ride_driver_consents for select to authenticated using (pool_private.participates(ride_id,family_id));
create policy assignment_read on public.driver_assignments for select to authenticated using (
  exists(select 1 from public.ride_families rf where rf.ride_id=driver_assignments.ride_id and pool_private.participates(rf.ride_id,rf.family_id)) or
  (released_at is null and pool_private.confirmed_driver(ride_id)));

-- Safe directory restricted to participating guardians for this ride.
create function pool_private.driver_options(p_ride_id uuid) returns table(driver_id uuid,driver_family_id uuid,display_name text,vehicle_id uuid,vehicle_label text,vehicle_version integer,passenger_seats integer) language plpgsql security definer set search_path = '' as $$
begin
  perform pool_private.require_actor();
  if not exists(select 1 from public.ride_families rf where rf.ride_id=p_ride_id and pool_private.participates(p_ride_id,rf.family_id)) then return; end if;
  return query select fm.user_id,fm.family_id,p.display_name,v.id,v.label,v.version,v.passenger_seats from public.rides r
    join public.circle_families cf on cf.circle_id=r.circle_id and cf.removed_at is null
    join public.family_members fm on fm.family_id=cf.family_id and fm.removed_at is null
    join public.profiles p on p.id=fm.user_id join public.vehicles v on v.driver_id=fm.user_id and v.retired_at is null where r.id=p_ride_id order by p.display_name,v.label;
end $$;
-- Effective state uses database time: expired proposals never imply coverage.
-- Also serves a proposed-only driver's inbox WITHOUT roster identities/addresses.
create function pool_private.driver_status(p_ride_ids uuid[],p_driver_only boolean,p_pending_only boolean,p_after_start timestamptz,p_after_id uuid,p_limit integer) returns table(proposal_id uuid,ride_id uuid,ride_revision integer,driver_id uuid,driver_name text,vehicle_id uuid,vehicle_label text,vehicle_version integer,passenger_seats integer,available_seats integer,restraints_confirmed boolean,accepted_at timestamptz,deadline timestamptz,proposal_status text,coverage text,rider_count integer,booster_count integer,child_seat_count integer,consent_count integer,pickup_summary text,destination_summary text,starts_at timestamptz,ends_at timestamptz,timezone text,is_driver boolean,cancelled_at timestamptz) language plpgsql security definer set search_path = '' as $$
begin
  perform pool_private.require_actor();
  if p_driver_only is null or p_pending_only is null or p_limit is null or p_limit not between 1 and 1000
    or (p_ride_ids is null and not p_driver_only)
    or (p_ride_ids is not null and (cardinality(p_ride_ids)>1000 or cardinality(p_ride_ids)<>(select count(distinct x) from unnest(p_ride_ids) x)))
    or ((p_after_start is null)<>(p_after_id is null)) or (p_after_start is not null and not isfinite(p_after_start)) then raise exception 'validation' using errcode='PT400'; end if;
  return query select p.id,r.id,p.ride_revision,p.driver_id,pr.display_name,v.id,v.label,p.vehicle_version,v.passenger_seats,p.available_seats,p.restraints_confirmed,p.accepted_at,p.deadline,
    case when p.status='pending' and p.deadline<=clock_timestamp() then 'expired' else p.status end,
    case when exists(select 1 from public.driver_assignments a where a.proposal_id=p.id and a.released_at is null) then 'confirmed'
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

create function public.save_vehicle(p_id uuid,p_label text,p_passenger_seats integer,p_version integer,p_retire boolean) returns uuid language sql security invoker set search_path = '' as $$ select pool_private.save_vehicle(p_id,p_label,p_passenger_seats,p_version,p_retire) $$;
revoke all on function public.save_vehicle(uuid,text,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.save_vehicle(uuid,text,integer,integer,boolean) to authenticated;

create function public.propose_driver(p_id uuid,p_ride_id uuid,p_family_id uuid,p_revision integer,p_driver_id uuid,p_driver_family_id uuid,p_vehicle_id uuid,p_vehicle_version integer) returns uuid language sql security invoker set search_path = '' as $$ select pool_private.propose_driver(p_id,p_ride_id,p_family_id,p_revision,p_driver_id,p_driver_family_id,p_vehicle_id,p_vehicle_version) $$;
revoke all on function public.propose_driver(uuid,uuid,uuid,integer,uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.propose_driver(uuid,uuid,uuid,integer,uuid,uuid,uuid,integer) to authenticated;

create function public.accept_driver_proposal(p_id uuid,p_revision integer,p_available_seats integer,p_restraints boolean) returns text language sql security invoker set search_path = '' as $$ select pool_private.reply_driver(p_id,p_revision,'accept',null,null,p_available_seats,p_restraints) $$;
revoke all on function public.accept_driver_proposal(uuid,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.accept_driver_proposal(uuid,integer,integer,boolean) to authenticated;

create function public.consent_for_own_children(p_id uuid,p_revision integer,p_family_id uuid,p_child_ids uuid[]) returns text language sql security invoker set search_path = '' as $$ select pool_private.reply_driver(p_id,p_revision,'consent',p_family_id,p_child_ids,null,null) $$;
revoke all on function public.consent_for_own_children(uuid,integer,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.consent_for_own_children(uuid,integer,uuid,uuid[]) to authenticated;

create function public.decline_driver_proposal(p_id uuid,p_revision integer) returns text language sql security invoker set search_path = '' as $$ select pool_private.reply_driver(p_id,p_revision,'decline',null,null,null,null) $$;
revoke all on function public.decline_driver_proposal(uuid,integer) from public,anon,authenticated;
grant execute on function public.decline_driver_proposal(uuid,integer) to authenticated;

create function public.cancel_driver_proposal(p_id uuid,p_revision integer,p_family_id uuid) returns text language sql security invoker set search_path = '' as $$ select pool_private.reply_driver(p_id,p_revision,'cancel',p_family_id,null,null,null) $$;
revoke all on function public.cancel_driver_proposal(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.cancel_driver_proposal(uuid,integer,uuid) to authenticated;

create function public.withdraw_driver(p_id uuid,p_revision integer) returns text language sql security invoker set search_path = '' as $$ select pool_private.reply_driver(p_id,p_revision,'withdraw',null,null,null,null) $$;
revoke all on function public.withdraw_driver(uuid,integer) from public,anon,authenticated;
grant execute on function public.withdraw_driver(uuid,integer) to authenticated;

create function public.revoke_own_consent(p_id uuid,p_revision integer,p_family_id uuid,p_child_ids uuid[]) returns text language sql security invoker set search_path = '' as $$ select pool_private.reply_driver(p_id,p_revision,'revoke',p_family_id,p_child_ids,null,null) $$;
revoke all on function public.revoke_own_consent(uuid,integer,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.revoke_own_consent(uuid,integer,uuid,uuid[]) to authenticated;

create function public.driver_options(p_ride_id uuid) returns table(driver_id uuid,driver_family_id uuid,display_name text,vehicle_id uuid,vehicle_label text,vehicle_version integer,passenger_seats integer) language sql security invoker set search_path = '' as $$ select * from pool_private.driver_options(p_ride_id) $$;
revoke all on function public.driver_options(uuid) from public,anon,authenticated;
grant execute on function public.driver_options(uuid) to authenticated;

create function public.driver_status(p_ride_id uuid) returns table(proposal_id uuid,ride_id uuid,ride_revision integer,driver_id uuid,driver_name text,vehicle_id uuid,vehicle_label text,vehicle_version integer,passenger_seats integer,available_seats integer,restraints_confirmed boolean,accepted_at timestamptz,deadline timestamptz,proposal_status text,coverage text,rider_count integer,booster_count integer,child_seat_count integer,consent_count integer,pickup_summary text,destination_summary text,starts_at timestamptz,ends_at timestamptz,timezone text,is_driver boolean,cancelled_at timestamptz) language sql security invoker set search_path = '' as $$ select * from pool_private.driver_status(array[p_ride_id],false,false,null,null,1) $$;
revoke all on function public.driver_status(uuid) from public,anon,authenticated;
grant execute on function public.driver_status(uuid) to authenticated;
-- Exact batches preserve coverage for every displayed ride, regardless of history.
create function public.driver_statuses(p_ride_ids uuid[]) returns table(proposal_id uuid,ride_id uuid,ride_revision integer,driver_id uuid,driver_name text,vehicle_id uuid,vehicle_label text,vehicle_version integer,passenger_seats integer,available_seats integer,restraints_confirmed boolean,accepted_at timestamptz,deadline timestamptz,proposal_status text,coverage text,rider_count integer,booster_count integer,child_seat_count integer,consent_count integer,pickup_summary text,destination_summary text,starts_at timestamptz,ends_at timestamptz,timezone text,is_driver boolean,cancelled_at timestamptz) language sql security invoker set search_path = '' as $$ select * from pool_private.driver_status(p_ride_ids,false,false,null,null,1000) $$;
revoke all on function public.driver_statuses(uuid[]) from public,anon,authenticated;
grant execute on function public.driver_statuses(uuid[]) to authenticated;
-- Driver role/pending filters and keyset cursor apply BEFORE the Data API row cap.
create function public.driver_inbox(p_after_start timestamptz default null,p_after_id uuid default null,p_limit integer default 26,p_pending_only boolean default false) returns table(proposal_id uuid,ride_id uuid,ride_revision integer,driver_id uuid,driver_name text,vehicle_id uuid,vehicle_label text,vehicle_version integer,passenger_seats integer,available_seats integer,restraints_confirmed boolean,accepted_at timestamptz,deadline timestamptz,proposal_status text,coverage text,rider_count integer,booster_count integer,child_seat_count integer,consent_count integer,pickup_summary text,destination_summary text,starts_at timestamptz,ends_at timestamptz,timezone text,is_driver boolean,cancelled_at timestamptz) language sql security invoker set search_path = '' as $$ select * from pool_private.driver_status(null,true,p_pending_only,p_after_start,p_after_id,p_limit) $$;
revoke all on function public.driver_inbox(timestamptz,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.driver_inbox(timestamptz,uuid,integer,boolean) to authenticated;

revoke all on function pool_private.driver_is_member(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function pool_private.confirmed_driver(uuid) from public,anon,authenticated;
revoke all on function pool_private.participates(uuid,uuid) from public,anon,authenticated;
revoke all on function pool_private.ride_roster(uuid) from public,anon,authenticated;
revoke all on function pool_private.lock_driver_ride(uuid,uuid) from public,anon,authenticated;
revoke all on function pool_private.close_driver(uuid,text) from public,anon,authenticated;
revoke all on function pool_private.expire_driver(uuid) from public,anon,authenticated;
revoke all on function pool_private.save_vehicle(uuid,text,integer,integer,boolean) from public,anon,authenticated;
revoke all on function pool_private.propose_driver(uuid,uuid,uuid,integer,uuid,uuid,uuid,integer) from public,anon,authenticated;
revoke all on function pool_private.finalize_driver(uuid) from public,anon,authenticated;
revoke all on function pool_private.reply_driver(uuid,integer,text,uuid,uuid[],integer,boolean) from public,anon,authenticated;
revoke all on function pool_private.guard_frozen_roster() from public,anon,authenticated;
revoke all on function pool_private.guard_driver_plan() from public,anon,authenticated;
revoke all on function pool_private.invalidate_driver_membership() from public,anon,authenticated;
revoke all on function pool_private.driver_options(uuid) from public,anon,authenticated;
revoke all on function pool_private.driver_status(uuid[],boolean,boolean,timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function pool_private.save_vehicle(uuid,text,integer,integer,boolean) to authenticated;
grant execute on function pool_private.propose_driver(uuid,uuid,uuid,integer,uuid,uuid,uuid,integer) to authenticated;
grant execute on function pool_private.reply_driver(uuid,integer,text,uuid,uuid[],integer,boolean) to authenticated;
grant execute on function pool_private.driver_options(uuid) to authenticated;
grant execute on function pool_private.driver_status(uuid[],boolean,boolean,timestamptz,uuid,integer) to authenticated;
grant execute on function pool_private.participates(uuid,uuid) to authenticated;
grant execute on function pool_private.confirmed_driver(uuid) to authenticated;
revoke all on function pool_private.owns_vehicle(uuid) from public,anon,authenticated;
grant execute on function pool_private.owns_vehicle(uuid) to authenticated;
