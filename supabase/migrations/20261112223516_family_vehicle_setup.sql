create function pool_private.family_has_active_vehicle(p_family_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  perform pool_private.require_actor();
  if not pool_private.member_of(p_family_id) then
    raise exception 'unavailable' using errcode = 'PT404';
  end if;

  return exists (
    select 1
    from public.family_members member
    join public.vehicles vehicle on vehicle.driver_id = member.user_id
    where member.family_id = p_family_id
      and member.removed_at is null
      and vehicle.retired_at is null
  );
end $$;

create function public.family_has_active_vehicle(p_family_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select pool_private.family_has_active_vehicle(p_family_id)
$$;

alter table public.driver_proposals add column vehicle_change_from_proposal_id uuid
  references public.driver_proposals(id);
create index driver_proposals_vehicle_change_source
  on public.driver_proposals(vehicle_change_from_proposal_id)
  where vehicle_change_from_proposal_id is not null;

create function pool_private.request_ride_vehicle_change(
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
    where ride_id = ride.id and (status = 'invited'
      or (status = 'joined' and not pool_private.ride_family_active(circle_id, family_id)))
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

  -- The roster and ride revision are unchanged. Request order makes the new
  -- proposal current, and acceptance and consent are scoped to its own ID.
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

create function public.request_ride_vehicle_change(
  p_id uuid, p_proposal_id uuid, p_revision integer, p_vehicle_id uuid, p_vehicle_version integer
) returns uuid language sql security invoker set search_path = '' as $$
  select pool_private.request_ride_vehicle_change(p_id, p_proposal_id, p_revision, p_vehicle_id, p_vehicle_version)
$$;

revoke all on function public.family_has_active_vehicle(uuid),
  pool_private.family_has_active_vehicle(uuid),
  public.request_ride_vehicle_change(uuid, uuid, integer, uuid, integer),
  pool_private.request_ride_vehicle_change(uuid, uuid, integer, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.family_has_active_vehicle(uuid),
  pool_private.family_has_active_vehicle(uuid),
  public.request_ride_vehicle_change(uuid, uuid, integer, uuid, integer),
  pool_private.request_ride_vehicle_change(uuid, uuid, integer, uuid, integer)
  to authenticated;
