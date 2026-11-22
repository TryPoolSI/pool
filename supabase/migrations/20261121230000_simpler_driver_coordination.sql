-- Simpler driver coordination. Prior migrations remain immutable.
--
-- What still needs a yes:
--   * a family putting its own children on a ride,
--   * an adult agreeing to drive,
--   * a guardian confirming they have their child at drop-off.
-- What is now only announced to the families on the ride:
--   * who is driving, and in which car,
--   * a change of driver or car,
--   * a family joining, leaving or changing riders after a driver is set.
--
-- So: a family that has not answered no longer blocks a driver, the driver's
-- own yes confirms the ride, and a swap needs only the new driver's yes.
-- A family that joins late keeps the driver when the car has room; a family
-- can take its own children off a ride at any time before pickup.

-- Keep a child's chosen receiving guardian when the family edits its riders.
create or replace function pool_private.replace_ride_riders(p_ride uuid, p_family uuid, p_children uuid[]) returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.ride_riders where ride_id = p_ride and family_id = p_family and not (child_id = any(p_children));
  insert into public.ride_riders(ride_id, family_id, child_id, display_name, seat_requirement)
    select p_ride, p_family, id, display_name, seat_requirement from public.children where id = any(p_children) and family_id = p_family
    on conflict (ride_id, child_id) do update set display_name = excluded.display_name, seat_requirement = excluded.seat_requirement;
end $$;

-- Called under the ride lock after riders change. Returns true when a driver
-- request or assignment stays in place, in which case the ride revision must
-- not move: assignments, trips and replies are bound to it.
create function pool_private.carry_driver_roster(p_ride uuid) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_roster jsonb := pool_private.ride_roster(p_ride);
  v_count integer := jsonb_array_length(v_roster);
  v_active uuid;
  v_request record;
begin
  perform pool_private.expire_driver(p_ride);
  select proposal_id into v_active from public.driver_assignments where ride_id = p_ride and released_at is null;
  if v_active is null and not exists(select 1 from public.driver_proposals where ride_id = p_ride and status = 'pending') then
    return false;
  end if;
  -- Nobody is riding any more: there is nothing left to drive.
  if v_count = 0 then
    perform pool_private.close_driver(p_ride, 'invalidated');
    return false;
  end if;
  for v_request in
    select p.id, p.accepted_at, p.available_seats, v.passenger_seats
    from public.driver_proposals p join public.vehicles v on v.id = p.vehicle_id
    where p.ride_id = p_ride and (p.id = v_active or p.status = 'pending')
    order by (p.id is not distinct from v_active) desc, p.id
    for update of p
  loop
    if v_count <= v_request.passenger_seats and (v_request.accepted_at is null or v_count <= v_request.available_seats) then
      update public.driver_proposals set roster = v_roster where id = v_request.id;
    elsif v_request.id is not distinct from v_active then
      -- The confirmed plan wins. The family is told the car is full.
      raise exception 'car_full' using errcode = 'PT422';
    else
      -- Someone was only asked, and their car no longer fits. Ask again.
      update public.driver_proposals set status = 'invalidated', closed_at = clock_timestamp() where id = v_request.id;
    end if;
  end loop;
  return v_active is not null or exists(select 1 from public.driver_proposals where ride_id = p_ride and status = 'pending');
end $$;
revoke all on function pool_private.carry_driver_roster(uuid) from public, anon, authenticated;

-- The two rider commands now decide for themselves what a change means for the
-- driver, so the blanket freeze on riders and family replies goes away. The
-- freeze after first pickup (R6) and on exact locations stays.
drop trigger frozen_riders on public.ride_riders;
drop trigger frozen_families on public.ride_families;

create or replace function pool_private.respond_to_ride_invitation(p_ride_id uuid, p_family_id uuid, p_revision integer, p_accept boolean, p_child_ids uuid[]) returns integer language plpgsql security definer set search_path = '' as $$
declare v_ride public.rides := pool_private.lock_own_ride(p_ride_id, p_family_id); v_status text;
begin
  perform pool_private.check_ride_revision(v_ride, p_revision);
  select status into v_status from public.ride_families where ride_id = p_ride_id and family_id = p_family_id;
  if v_status = 'joined' then raise exception 'already_joined' using errcode = 'PT409'; end if;
  if p_accept is null or p_child_ids is null or (not p_accept and cardinality(p_child_ids) <> 0) then raise exception 'validation' using errcode = 'PT400'; end if;
  perform pool_private.validate_own_riders(p_family_id, p_child_ids, p_accept);
  update public.ride_families set status = case when p_accept then 'joined' else 'declined' end, responded_at = now() where ride_id = p_ride_id and family_id = p_family_id;
  perform pool_private.replace_ride_riders(p_ride_id, p_family_id, p_child_ids);
  if not pool_private.carry_driver_roster(p_ride_id) then
    update public.rides set revision = revision + 1 where id = p_ride_id returning revision into p_revision;
  end if;
  return p_revision;
end $$;

create or replace function pool_private.set_own_ride_riders(p_ride_id uuid, p_family_id uuid, p_revision integer, p_child_ids uuid[]) returns integer language plpgsql security definer set search_path = '' as $$
declare v_ride public.rides := pool_private.lock_own_ride(p_ride_id, p_family_id);
begin
  perform pool_private.check_ride_revision(v_ride, p_revision);
  if not exists(select 1 from public.ride_families where ride_id = p_ride_id and family_id = p_family_id and status = 'joined') then raise exception 'unavailable' using errcode = 'PT404'; end if;
  perform pool_private.validate_own_riders(p_family_id, p_child_ids, false);
  perform pool_private.replace_ride_riders(p_ride_id, p_family_id, p_child_ids);
  update public.ride_families set status = case when cardinality(p_child_ids) = 0 then 'withdrawn' else 'joined' end, responded_at = now() where ride_id = p_ride_id and family_id = p_family_id;
  if not pool_private.carry_driver_roster(p_ride_id) then
    update public.rides set revision = revision + 1 where id = p_ride_id returning revision into p_revision;
  end if;
  return p_revision;
end $$;

-- Asking someone to drive no longer waits for every invited family.
create or replace function pool_private.propose_driver(p_id uuid,p_ride_id uuid,p_family_id uuid,p_revision integer,p_driver_id uuid,p_driver_family_id uuid,p_vehicle_id uuid,p_vehicle_version integer) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid:=pool_private.require_actor(); v_ride public.rides; v_vehicle public.vehicles; v_existing public.driver_proposals; prior public.driver_assignments;
begin
  v_ride:=pool_private.lock_driver_ride(p_ride_id,p_driver_family_id);
  if not pool_private.participates(p_ride_id,p_family_id) then raise exception 'unavailable' using errcode='PT404'; end if;
  select * into v_existing from public.driver_proposals where id=p_id;
  if found then
    if v_existing.nominated_by<>v_actor or v_existing.ride_id<>p_ride_id then raise exception 'unavailable' using errcode='PT404'; end if;
    if (v_existing.mode='initial' or (v_existing.mode='unavailable' and v_existing.status='pending' and v_existing.deadline>clock_timestamp())) and v_existing.driver_id=p_driver_id and v_existing.driver_family_id=p_driver_family_id and v_existing.vehicle_id=p_vehicle_id and v_existing.vehicle_version=p_vehicle_version
      and v_existing.nominating_family_id=p_family_id and v_existing.ride_revision=p_revision+1 then return p_id; end if;
    raise exception 'duplicate_request' using errcode='PT409';
  end if;
  if exists(select 1 from public.ride_trips where ride_id=p_ride_id) then raise exception 'trip_frozen' using errcode='PT423'; end if;
  perform pool_private.check_ride_revision(v_ride,p_revision);
  perform pool_private.expire_driver(p_ride_id);
  if v_ride.starts_at<=clock_timestamp() then raise exception 'expired' using errcode='PT410'; end if;
  if exists(select 1 from public.driver_assignments where ride_id=p_ride_id and released_at is null)
    or exists(select 1 from public.driver_proposals where ride_id=p_ride_id and status='pending') then raise exception 'already_assigned_or_pending' using errcode='PT409'; end if;
  if not pool_private.driver_is_member(v_ride.circle_id,p_driver_family_id,p_driver_id) then raise exception 'unavailable' using errcode='PT404'; end if;
  if exists(select 1 from public.ride_families where ride_id=p_ride_id and status='joined' and not pool_private.ride_family_active(circle_id,family_id))
    or not exists(select 1 from public.ride_riders where ride_id=p_ride_id) then raise exception 'roster_not_ready' using errcode='PT422'; end if;
  perform 1 from public.profiles where id in (v_actor,p_driver_id) order by id for update;
  select * into v_vehicle from public.vehicles where id=p_vehicle_id for update;
  if not found or v_vehicle.driver_id<>p_driver_id or v_vehicle.retired_at is not null then raise exception 'unavailable' using errcode='PT404'; end if;
  if v_vehicle.version<>p_vehicle_version then raise exception 'stale_vehicle' using errcode='PT409'; end if;
  if v_vehicle.passenger_seats<(select count(*) from public.ride_riders where ride_id=p_ride_id) then raise exception 'insufficient_seats' using errcode='PT422'; end if;
  select * into prior from public.driver_assignments where ride_id=p_ride_id order by confirmed_at desc,id desc limit 1;
  update public.rides set revision=revision+1 where id=p_ride_id returning revision into p_revision;
  insert into public.driver_proposals(id,ride_id,ride_revision,nominated_by,nominating_family_id,driver_id,driver_family_id,vehicle_id,vehicle_version,roster,deadline,mode,original_assignment_id,original_assignment_revision)
    values(p_id,p_ride_id,p_revision,v_actor,p_family_id,p_driver_id,p_driver_family_id,p_vehicle_id,p_vehicle_version,pool_private.ride_roster(p_ride_id),v_ride.starts_at,
      case when prior.release_reason='withdrawn' then 'unavailable' else 'initial' end,
      case when prior.release_reason='withdrawn' then prior.id end,case when prior.release_reason='withdrawn' then prior.ride_revision end);
  if v_ride.starts_at<=clock_timestamp() then raise exception 'expired' using errcode='PT410'; end if;
  return p_id;
end $$;

create or replace function pool_private.request_replacement(p_id uuid,p_ride_id uuid,p_family_id uuid,p_revision integer,p_driver_id uuid,p_driver_family_id uuid,p_vehicle_id uuid,p_vehicle_version integer,p_mode text,p_original_assignment_id uuid,p_original_assignment_revision integer,p_deadline timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=pool_private.require_actor(); r public.rides; a public.driver_assignments; v public.vehicles; existing public.driver_proposals;
begin
  r:=pool_private.lock_driver_ride(p_ride_id,p_driver_family_id);
  if not pool_private.participates(r.id,p_family_id) then raise exception 'unavailable' using errcode='PT404'; end if;
  if exists(select 1 from public.ride_trips where ride_id=r.id) then raise exception 'trip_frozen' using errcode='PT423'; end if;
  perform pool_private.check_ride_revision(r,p_revision);
  if p_id is null or p_mode is null or p_mode not in ('optional_swap','unavailable') or p_deadline is null or not isfinite(p_deadline)
    or p_deadline>r.starts_at then raise exception 'invalid_deadline_or_mode' using errcode='PT400'; end if;
  select * into existing from public.driver_proposals where id=p_id;
  if found then
    if existing.nominated_by=actor and existing.ride_id=r.id and existing.nominating_family_id=p_family_id
      and (existing.driver_id,existing.driver_family_id,existing.vehicle_id,existing.vehicle_version,existing.mode,existing.original_assignment_id,existing.original_assignment_revision,existing.deadline,existing.ride_revision)
       is not distinct from (p_driver_id,p_driver_family_id,p_vehicle_id,p_vehicle_version,p_mode,p_original_assignment_id,p_original_assignment_revision,p_deadline,p_revision)
      and existing.status='pending' and existing.deadline>clock_timestamp() then return p_id; end if;
    raise exception 'closed_or_different_request' using errcode='PT409';
  end if;
  if p_deadline<=clock_timestamp() then raise exception 'expired' using errcode='PT410'; end if;
  perform pool_private.expire_driver(r.id);
  if exists(select 1 from public.driver_proposals where ride_id=r.id and status='pending') then raise exception 'pending_request' using errcode='PT409'; end if;
  select * into a from public.driver_assignments where id=p_original_assignment_id and ride_id=r.id for update;
  if not found or p_original_assignment_revision is distinct from a.ride_revision then raise exception 'stale_assignment' using errcode='PT409'; end if;
  if p_mode='optional_swap' then
    if a.released_at is not null or a.ride_revision<>r.revision then raise exception 'original_unavailable' using errcode='PT409'; end if;
  else
    if a.release_reason is distinct from 'withdrawn' or exists(select 1 from public.driver_assignments where ride_id=r.id and released_at is null)
      or a.id<>(select id from public.driver_assignments where ride_id=r.id order by confirmed_at desc,id desc limit 1)
      then raise exception 'fresh_unavailable_request_required' using errcode='PT409'; end if;
  end if;
  if p_mode='optional_swap' and p_driver_id=a.driver_id then raise exception 'choose_replacement' using errcode='PT400'; end if;
  if not pool_private.driver_is_member(r.circle_id,p_driver_family_id,p_driver_id) then raise exception 'unavailable' using errcode='PT404'; end if;
  if exists(select 1 from public.ride_families where ride_id=r.id and status='joined' and not pool_private.ride_family_active(circle_id,family_id))
    or not exists(select 1 from public.ride_riders where ride_id=r.id) then raise exception 'roster_not_ready' using errcode='PT422'; end if;
  perform 1 from public.profiles where id in (actor,p_driver_id) order by id for update;
  select * into v from public.vehicles where id=p_vehicle_id for update;
  if not found or v.driver_id<>p_driver_id or v.retired_at is not null then raise exception 'unavailable' using errcode='PT404'; end if;
  if v.version is distinct from p_vehicle_version then raise exception 'stale_vehicle' using errcode='PT409'; end if;
  if v.passenger_seats<(select count(*) from public.ride_riders where ride_id=r.id) then raise exception 'capacity' using errcode='PT422'; end if;
  if p_deadline<=clock_timestamp() then raise exception 'expired' using errcode='PT410'; end if;
  insert into public.driver_proposals(id,ride_id,ride_revision,nominated_by,nominating_family_id,driver_id,driver_family_id,vehicle_id,vehicle_version,roster,deadline,mode,original_assignment_id,original_assignment_revision)
    values(p_id,r.id,r.revision,actor,p_family_id,p_driver_id,p_driver_family_id,p_vehicle_id,p_vehicle_version,pool_private.ride_roster(r.id),p_deadline,p_mode,a.id,a.ride_revision);
  if p_deadline<=clock_timestamp() then raise exception 'expired' using errcode='PT410'; end if;
  return p_id;
end $$;

-- The driver's own yes confirms the ride. Families are told, not asked.
create or replace function pool_private.finalize_driver(p_id uuid) returns text language plpgsql security definer set search_path = '' as $$
declare p public.driver_proposals; r public.rides; v public.vehicles; original public.driver_assignments;
begin
  select * into p from public.driver_proposals where id=p_id;
  select * into r from public.rides where id=p.ride_id;
  if p.status<>'pending' then return p.status; end if;
  if exists(select 1 from public.ride_trips where ride_id=r.id) then raise exception 'trip_frozen' using errcode='PT423'; end if;
  if p.mode<>'initial' then
    select * into original from public.driver_assignments where id=p.original_assignment_id for update;
    if original.ride_id<>r.id or original.ride_revision<>p.original_assignment_revision or
      (p.mode='optional_swap' and (original.released_at is not null or original.ride_revision<>r.revision)) or
      (p.mode='unavailable' and (original.release_reason is distinct from 'withdrawn' or exists(select 1 from public.driver_assignments where ride_id=r.id and released_at is null)))
      then raise exception 'stale_original' using errcode='PT409'; end if;
  end if;
  if p.deadline<=clock_timestamp() then raise exception 'expired' using errcode='PT410'; end if;
  if r.cancelled_at is not null or p.ride_revision<>r.revision or p.roster<>pool_private.ride_roster(r.id) then raise exception 'stale_plan' using errcode='PT409'; end if;
  if not pool_private.driver_is_member(r.circle_id,p.driver_family_id,p.driver_id)
    or exists(select 1 from public.ride_families where ride_id=r.id and status='joined' and not pool_private.ride_family_active(circle_id,family_id)) then raise exception 'membership_changed' using errcode='PT409'; end if;
  perform 1 from public.profiles where id=p.driver_id for update;
  select * into v from public.vehicles where id=p.vehicle_id for update;
  if p.deadline<=clock_timestamp() then raise exception 'expired' using errcode='PT410'; end if;
  if v.driver_id<>p.driver_id or v.version<>p.vehicle_version or v.retired_at is not null then raise exception 'stale_vehicle' using errcode='PT409'; end if;
  if v.passenger_seats<jsonb_array_length(p.roster) then raise exception 'insufficient_seats' using errcode='PT422'; end if;
  if p.accepted_at is null then return 'awaiting_confirmation'; end if;
  if not p.restraints_confirmed or p.available_seats<jsonb_array_length(p.roster) or p.available_seats>v.passenger_seats then raise exception 'capacity_or_restraints' using errcode='PT422'; end if;
  if p.deadline<=clock_timestamp() then raise exception 'expired' using errcode='PT410'; end if;
  if exists(select 1 from public.ride_trips t join public.driver_assignments active on active.id=t.assignment_id
    where t.completed_at is null and (active.driver_id=p.driver_id or active.vehicle_id=p.vehicle_id)) then raise exception 'unfinished_trip' using errcode='PT424'; end if;
  -- Release the outgoing driver in the same transaction as the INSERT.
  -- Any exception (including a waiting exclusion check or deadline) restores it.
  if p.mode='optional_swap' then
    update public.driver_assignments set released_at=clock_timestamp(),release_reason='replaced' where id=original.id;
    update public.driver_proposals set status='invalidated',closed_at=clock_timestamp() where id=original.proposal_id;
  end if;
  begin
    insert into public.driver_assignments(proposal_id,ride_id,ride_revision,driver_id,vehicle_id,vehicle_version,starts_at,ends_at)
      values(p.id,r.id,r.revision,p.driver_id,p.vehicle_id,p.vehicle_version,r.starts_at,r.ends_at);
  exception when exclusion_violation then raise exception 'driver_or_vehicle_reserved' using errcode='PT424';
  end;
  if p.deadline<=clock_timestamp() then raise exception 'expired' using errcode='PT410'; end if;
  update public.driver_proposals set status='confirmed',closed_at=clock_timestamp() where id=p.id;
  if p.deadline<=clock_timestamp() then raise exception 'expired' using errcode='PT410'; end if;
  return 'confirmed';
end $$;

-- First pickup: the confirmed driver, a seat for every rider, and someone
-- named to receive each child. An unanswered invitation supplies no riders.
create or replace function pool_private.start_trip(p_ride uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.rides; a public.driver_assignments; p public.driver_proposals; v public.vehicles;
begin
  select * into r from public.rides where id=p_ride;
  select * into a from public.driver_assignments where ride_id=r.id and released_at is null;
  select * into p from public.driver_proposals where id=a.proposal_id;
  if a.id is null or p.status<>'confirmed' or r.cancelled_at is not null or r.revision<>a.ride_revision or p.roster<>pool_private.ride_roster(r.id)
    or jsonb_array_length(p.roster)=0 then raise exception 'invalid_assignment' using errcode='PT409'; end if;
  if not pool_private.driver_is_member(r.circle_id,p.driver_family_id,a.driver_id) or exists(
    select 1 from public.ride_families where ride_id=r.id and status='joined' and not pool_private.ride_family_active(circle_id,family_id))
    then raise exception 'membership_changed' using errcode='PT409'; end if;
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
  if exists(select 1 from public.ride_trips t join public.driver_assignments other on other.id=t.assignment_id
    where t.completed_at is null and (other.driver_id=a.driver_id or other.vehicle_id=a.vehicle_id))
    then raise exception 'unfinished_driver_or_vehicle_trip' using errcode='PT424'; end if;
  insert into public.ride_trips(ride_id,assignment_id,ride_revision) values(r.id,a.id,a.ride_revision);
end $$;

-- A driver changing to another of their own cars.
create or replace function pool_private.request_ride_vehicle_change(
  p_id uuid, p_proposal_id uuid, p_revision integer, p_vehicle_id uuid, p_vehicle_version integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := pool_private.require_actor();
  source public.driver_proposals;
  existing public.driver_proposals;
  ride public.rides;
  assignment public.driver_assignments;
  vehicle public.vehicles;
  review_deadline timestamptz;
  proposal_mode text;
  origin_id uuid;
  origin_revision integer;
begin
  if p_id is null or p_proposal_id is null or p_revision is null
    or p_vehicle_id is null or p_vehicle_version is null then
    raise exception 'validation' using errcode = 'PT400';
  end if;

  select * into source from public.driver_proposals where id = p_proposal_id;
  if not found or source.driver_id <> actor_id then
    raise exception 'unavailable' using errcode = 'PT404';
  end if;
  ride := pool_private.lock_driver_ride(source.ride_id, source.driver_family_id);
  select * into source from public.driver_proposals where id = p_proposal_id for update;
  if not pool_private.driver_is_member(ride.circle_id, source.driver_family_id, actor_id) then
    raise exception 'unavailable' using errcode = 'PT404';
  end if;
  if source.ride_revision <> p_revision then
    raise exception 'stale_proposal' using errcode = 'PT409';
  end if;

  select * into existing from public.driver_proposals where id = p_id;
  if found then
    if existing.vehicle_change_from_proposal_id = source.id and existing.nominated_by = actor_id
      and existing.vehicle_id = p_vehicle_id and existing.vehicle_version = p_vehicle_version then
      return p_id;
    end if;
    raise exception 'duplicate_request' using errcode = 'PT409';
  end if;

  if exists (select 1 from public.ride_trips where ride_id = ride.id) then
    raise exception 'trip_frozen' using errcode = 'PT423';
  end if;
  perform pool_private.check_ride_revision(ride, p_revision);
  if source.roster <> pool_private.ride_roster(ride.id) then
    raise exception 'stale_proposal' using errcode = 'PT409';
  end if;
  if exists (
    select 1 from public.ride_families
    where ride_id = ride.id and status = 'joined'
      and not pool_private.ride_family_active(circle_id, family_id)
  ) then
    raise exception 'roster_not_ready' using errcode = 'PT422';
  end if;

  if source.status = 'pending' then
    review_deadline := least(source.deadline, ride.starts_at);
    proposal_mode := source.mode;
    origin_id := source.original_assignment_id;
    origin_revision := source.original_assignment_revision;
  elsif source.status = 'confirmed' then
    select * into assignment from public.driver_assignments
    where proposal_id = source.id and released_at is null for update;
    if not found then
      raise exception 'stale_assignment' using errcode = 'PT409';
    end if;
    if exists (
      select 1 from public.driver_proposals
      where ride_id = ride.id and status = 'pending' and deadline > clock_timestamp()
    ) then
      raise exception 'pending_request' using errcode = 'PT409';
    end if;
    review_deadline := ride.starts_at;
    proposal_mode := 'optional_swap';
    origin_id := assignment.id;
    origin_revision := assignment.ride_revision;
  else
    raise exception 'closed_proposal' using errcode = 'PT409';
  end if;

  if proposal_mode = 'optional_swap' and source.status = 'pending' then
    select * into assignment from public.driver_assignments
    where id = origin_id and released_at is null for update;
    if not found or assignment.ride_revision <> ride.revision then
      raise exception 'stale_assignment' using errcode = 'PT409';
    end if;
  end if;

  if p_vehicle_id = source.vehicle_id
    or (assignment.driver_id = actor_id and p_vehicle_id = assignment.vehicle_id) then
    raise exception 'choose_different_vehicle' using errcode = 'PT400';
  end if;
  if review_deadline <= clock_timestamp() then
    raise exception 'expired' using errcode = 'PT410';
  end if;

  perform 1 from public.profiles where id = actor_id for update;
  select * into vehicle from public.vehicles where id = p_vehicle_id for update;
  if not found or vehicle.driver_id <> actor_id or vehicle.retired_at is not null then
    raise exception 'unavailable' using errcode = 'PT404';
  end if;
  if vehicle.version <> p_vehicle_version then
    raise exception 'stale_vehicle' using errcode = 'PT409';
  end if;
  if vehicle.passenger_seats < jsonb_array_length(source.roster) then
    raise exception 'insufficient_seats' using errcode = 'PT422';
  end if;

  if source.status = 'pending' then
    update public.driver_proposals set status = 'invalidated', closed_at = clock_timestamp()
    where id = source.id;
  else
    perform pool_private.expire_driver(ride.id);
  end if;

  insert into public.driver_proposals (
    id, ride_id, ride_revision, nominated_by, nominating_family_id, driver_id,
    driver_family_id, vehicle_id, vehicle_version, roster, deadline, mode,
    original_assignment_id, original_assignment_revision, vehicle_change_from_proposal_id
  ) values (
    p_id, ride.id, ride.revision, actor_id, source.nominating_family_id, actor_id,
    source.driver_family_id, vehicle.id, vehicle.version, source.roster, review_deadline,
    proposal_mode, origin_id, origin_revision, source.id
  );
  if review_deadline <= clock_timestamp() then
    raise exception 'expired' using errcode = 'PT410';
  end if;
  return p_id;
end $$;

-- "I can drive" on Home: open as soon as one family has riders on the ride.
create or replace function pool_private.drive_offer_details(p_ride_ids uuid[])
returns table(ride_id uuid, ride_revision integer, rider_count integer, booster_count integer, child_seat_count integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := pool_private.require_actor();
  v_max_seats integer;
begin
  if cardinality(p_ride_ids) > 1000 then
    raise exception 'validation' using errcode = 'PT400';
  end if;
  select max(v.passenger_seats) into v_max_seats from public.vehicles v
    where v.driver_id = v_actor and v.retired_at is null;
  if v_max_seats is null then return; end if;

  return query
    select r.id, r.revision, riders.total, riders.boosters, riders.child_seats
    from public.rides r
    cross join lateral (
      select count(*)::integer as total,
        count(*) filter (where rr.seat_requirement = 'booster')::integer as boosters,
        count(*) filter (where rr.seat_requirement = 'child-seat')::integer as child_seats
      from public.ride_riders rr where rr.ride_id = r.id
    ) riders
    where r.id = any(p_ride_ids) and r.cancelled_at is null and r.starts_at > clock_timestamp()
      and riders.total between 1 and v_max_seats
      and exists (
        select 1 from public.ride_families rf
        where rf.ride_id = r.id and pool_private.participates(r.id, rf.family_id)
      )
      and not exists (
        select 1 from public.ride_families rf where rf.ride_id = r.id
          and rf.status = 'joined' and not pool_private.ride_family_active(r.circle_id, rf.family_id)
      )
      and not exists (select 1 from public.ride_trips t where t.ride_id = r.id)
      and not exists (select 1 from public.driver_assignments a where a.ride_id = r.id and a.released_at is null)
      and not exists (
        select 1 from public.driver_proposals p where p.ride_id = r.id
          and p.status = 'pending' and p.deadline > clock_timestamp()
      )
      and not pool_private.driver_has_ride_conflict(v_actor, r);
end $$;

-- A family that is still deciding sees who is driving before it answers:
-- joining a ride is the family's yes to that driver.
create or replace function pool_private.driver_status(p_ride_ids uuid[],p_driver_only boolean,p_pending_only boolean,p_after_start timestamptz,p_after_id uuid,p_limit integer) returns table(proposal_id uuid,ride_id uuid,ride_revision integer,driver_id uuid,driver_name text,vehicle_id uuid,vehicle_label text,vehicle_version integer,passenger_seats integer,available_seats integer,restraints_confirmed boolean,accepted_at timestamptz,deadline timestamptz,proposal_status text,coverage text,rider_count integer,booster_count integer,child_seat_count integer,consent_count integer,pickup_summary text,destination_summary text,starts_at timestamptz,ends_at timestamptz,timezone text,is_driver boolean,cancelled_at timestamptz,mode text,current_assignment_id uuid,current_assignment_revision integer,current_driver_name text,current_proposal_id uuid,current_proposal_revision integer,is_current_driver boolean,current_assignment_release_reason text,is_completed_driver boolean) language plpgsql security definer set search_path = '' as $$
begin
  perform pool_private.require_actor();
  if p_driver_only is null or p_pending_only is null or p_limit is null or p_limit not between 1 and 1000
    or (p_ride_ids is null and not p_driver_only)
    or (p_ride_ids is not null and (cardinality(p_ride_ids)>1000 or cardinality(p_ride_ids)<>(select count(distinct x) from unnest(p_ride_ids) x)))
    or ((p_after_start is null)<>(p_after_id is null)) or (p_after_start is not null and not isfinite(p_after_start)) then raise exception 'validation' using errcode='PT400'; end if;
  return query select p.id,r.id,p.ride_revision,p.driver_id,pr.display_name,v.id,v.label,p.vehicle_version,v.passenger_seats,p.available_seats,p.restraints_confirmed,p.accepted_at,p.deadline,
    case when p.status='pending' and p.deadline<=clock_timestamp() then 'expired' else p.status end,
    case when exists(select 1 from public.ride_trips t join public.driver_assignments a on a.id=t.assignment_id where t.ride_id=r.id and t.completed_at is not null) then 'confirmed' when exists(select 1 from public.driver_assignments a where a.ride_id=r.id and a.released_at is null) then 'confirmed'
      when p.status='pending' and p.deadline>clock_timestamp() then 'awaiting_confirmation' else 'needs_driver' end,
    jsonb_array_length(p.roster),
    (select count(*)::integer from jsonb_array_elements(p.roster) x where x->>'seat'='booster'),
    (select count(*)::integer from jsonb_array_elements(p.roster) x where x->>'seat'='child-seat'),
    (select count(*)::integer from public.ride_driver_consents c where c.proposal_id=p.id and c.revoked_at is null),
    r.pickup_summary,r.destination_summary,r.starts_at,r.ends_at,r.timezone,p.driver_id=pool_private.actor(),r.cancelled_at,p.mode,origin.id,origin.ride_revision,
    (select display_name from public.profiles where id=origin.driver_id),origin.proposal_id,origin.ride_revision,
    origin.released_at is null and origin.driver_id=pool_private.actor(),origin.release_reason,
    exists(select 1 from public.ride_trips t join public.driver_assignments completed on completed.id=t.assignment_id
      where t.ride_id=r.id and t.completed_at is not null and completed.driver_id=pool_private.actor())
    from public.driver_proposals p join public.rides r on r.id=p.ride_id join public.vehicles v on v.id=p.vehicle_id join public.profiles pr on pr.id=p.driver_id
    left join lateral (select a.* from public.driver_assignments a where a.ride_id=r.id
      order by (a.released_at is null) desc,a.confirmed_at desc,a.id desc limit 1) origin on true
    where (p_ride_ids is null or r.id=any(p_ride_ids))
      and (not p_driver_only or p.driver_id=pool_private.actor() or (not p_pending_only and pool_private.confirmed_driver(r.id)))
      and (not p_pending_only or (p.status='pending' and p.deadline>clock_timestamp()))
      and (p_after_start is null or (r.starts_at,r.id)>(p_after_start,p_after_id)) and
      (exists(select 1 from public.ride_families rf where rf.ride_id=r.id and rf.status in ('joined','invited')
         and pool_private.member_of(rf.family_id) and pool_private.ride_family_active(rf.circle_id,rf.family_id)) or
       (p.driver_id=pool_private.actor() and pool_private.driver_is_member(r.circle_id,p.driver_family_id,p.driver_id)) or pool_private.confirmed_driver(r.id))
      and p.id=(select newest.id from public.driver_proposals newest where newest.ride_id=r.id order by newest.ride_revision desc,newest.request_order desc limit 1)
    order by r.starts_at,r.id limit p_limit;
end $$;

-- Families no longer approve a driver, so nothing is ever waiting on one.
-- Kept so installed clients that still call it get an empty answer.
create or replace function public.pending_family_consents() returns table (ride_id uuid)
language sql stable security invoker set search_path = '' as $$
  select proposal.ride_id from public.driver_proposals proposal where false
$$;

-- What changed on my upcoming rides: the in-app announcement that replaces
-- asking every family. Kinds: driver_set, driver_changed (someone took over),
-- car_changed (same driver, other car), driver_left, family_joined, family_left. Names only people and families already on the ride.
create function pool_private.ride_updates(p_since timestamptz, p_limit integer)
returns table(ride_id uuid, kind text, who text, occurred_at timestamptz, starts_at timestamptz, timezone text, pickup_summary text, destination_summary text)
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := pool_private.require_actor();
begin
  if p_since is null or not isfinite(p_since) or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'validation' using errcode = 'PT400';
  end if;
  return query
    select u.ride_id, u.kind, u.who, u.occurred_at, r.starts_at, r.timezone, r.pickup_summary, r.destination_summary
    from (
      -- Someone else is now the driver.
      select a.ride_id, case
          when exists(select 1 from public.driver_proposals p join public.driver_assignments before on before.id = p.original_assignment_id
            where p.id = a.proposal_id and p.mode = 'optional_swap' and before.driver_id = a.driver_id) then 'car_changed'
          when a.proposal_id in (select p.id from public.driver_proposals p where p.mode = 'optional_swap') then 'driver_changed'
          else 'driver_set' end as kind,
        pr.display_name as who, a.confirmed_at as occurred_at
      from public.driver_assignments a join public.profiles pr on pr.id = a.driver_id
      where a.released_at is null and a.driver_id <> v_actor and a.confirmed_at >= p_since
      union all
      -- The driver dropped out and nobody has stepped in yet.
      select a.ride_id, 'driver_left', pr.display_name, a.released_at
      from public.driver_assignments a join public.profiles pr on pr.id = a.driver_id
      where a.released_at >= p_since and a.driver_id <> v_actor
        and a.release_reason in ('withdrawn', 'invalidated', 'consent_revoked', 'cancelled')
        and not exists(select 1 from public.driver_assignments now_driving where now_driving.ride_id = a.ride_id and now_driving.released_at is null)
        and a.id = (select latest.id from public.driver_assignments latest where latest.ride_id = a.ride_id order by latest.confirmed_at desc, latest.id desc limit 1)
      union all
      -- Another family answered or changed riders after the ride was planned.
      -- Only the person driving needs to know who is in the car. A family that
      -- declines its invitation never had riders, so there is nothing to tell.
      select rf.ride_id, case rf.status when 'joined' then 'family_joined' else 'family_left' end, f.name, rf.responded_at
      from public.ride_families rf join public.families f on f.id = rf.family_id join public.rides own on own.id = rf.ride_id
      where rf.responded_at >= p_since and rf.status in ('joined', 'withdrawn')
        and rf.family_id <> own.creator_family_id and not pool_private.member_of(rf.family_id)
        and pool_private.confirmed_driver(rf.ride_id)
    ) u join public.rides r on r.id = u.ride_id
    where r.cancelled_at is null and r.ends_at > clock_timestamp()
      and not exists(select 1 from public.ride_trips t where t.ride_id = r.id and t.completed_at is not null)
      and (pool_private.confirmed_driver(r.id) or exists(
        select 1 from public.ride_families mine where mine.ride_id = r.id and pool_private.participates(r.id, mine.family_id)))
    order by u.occurred_at desc, u.ride_id limit p_limit;
end $$;
create function public.ride_updates(p_since timestamptz, p_limit integer default 20)
returns table(ride_id uuid, kind text, who text, occurred_at timestamptz, starts_at timestamptz, timezone text, pickup_summary text, destination_summary text)
language sql security invoker set search_path = '' as $$ select * from pool_private.ride_updates(p_since, p_limit) $$;
revoke all on function pool_private.ride_updates(timestamptz, integer), public.ride_updates(timestamptz, integer) from public, anon, authenticated;
grant execute on function pool_private.ride_updates(timestamptz, integer), public.ride_updates(timestamptz, integer) to authenticated;
