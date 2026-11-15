alter table public.driver_proposals
  add column is_driver_offer boolean not null default false;

create function pool_private.driver_has_ride_conflict(p_driver_id uuid, p_ride public.rides)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.driver_assignments a
    where a.driver_id = p_driver_id and a.released_at is null
      and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(p_ride.starts_at, p_ride.ends_at, '[)')
  ) or exists (
    select 1 from public.ride_trips t join public.driver_assignments a on a.id = t.assignment_id
    where a.driver_id = p_driver_id and t.completed_at is null
  )
$$;

-- Home already lists joined rides. Return just the current eligibility and
-- restraint counts for those rides, without opening a directory of other rides.
create function pool_private.drive_offer_details(p_ride_ids uuid[])
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
          and (rf.status = 'invited' or (rf.status = 'joined' and not pool_private.ride_family_active(r.circle_id, rf.family_id)))
      )
      and not exists (select 1 from public.ride_trips t where t.ride_id = r.id)
      and not exists (select 1 from public.driver_assignments a where a.ride_id = r.id and a.released_at is null)
      and not exists (
        select 1 from public.driver_proposals p where p.ride_id = r.id
          and p.status = 'pending' and p.deadline > clock_timestamp()
      )
      and not pool_private.driver_has_ride_conflict(v_actor, r);
end $$;

create function pool_private.offer_to_drive(
  p_id uuid, p_ride_id uuid, p_family_id uuid, p_revision integer,
  p_vehicle_id uuid, p_vehicle_version integer, p_available_seats integer, p_restraints boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := pool_private.require_actor();
  v_ride public.rides;
  v_existing public.driver_proposals;
begin
  if p_id is null or p_revision is null or p_vehicle_version is null then
    raise exception 'validation' using errcode = 'PT400';
  end if;
  v_ride := pool_private.lock_driver_ride(p_ride_id, p_family_id);
  if not pool_private.participates(p_ride_id, p_family_id) then
    raise exception 'unavailable' using errcode = 'PT404';
  end if;

  select * into v_existing from public.driver_proposals where id = p_id;
  if found then
    if v_existing.nominated_by <> v_actor or v_existing.ride_id <> p_ride_id then
      raise exception 'unavailable' using errcode = 'PT404';
    end if;
    if v_existing.is_driver_offer and v_existing.nominating_family_id = p_family_id
      and v_existing.ride_revision - 1 = p_revision
      and v_existing.vehicle_id = p_vehicle_id and v_existing.vehicle_version = p_vehicle_version
      and v_existing.available_seats = p_available_seats and p_restraints is true then
      return p_id;
    end if;
    raise exception 'duplicate_request' using errcode = 'PT409';
  end if;

  -- Give the losing submission a useful response even though the winner
  -- also advanced the ride revision.
  if exists (select 1 from public.driver_assignments a where a.ride_id = p_ride_id and a.released_at is null)
    or exists (select 1 from public.driver_proposals p where p.ride_id = p_ride_id
      and p.status = 'pending' and p.deadline > clock_timestamp()) then
    raise exception 'already_assigned_or_pending' using errcode = 'PT409';
  end if;

  -- Reuse nomination and acceptance validation, locking and finalization.
  -- Any rejection rolls back the proposal and its revision bump together.
  perform pool_private.propose_driver(p_id, p_ride_id, p_family_id, p_revision,
    v_actor, p_family_id, p_vehicle_id, p_vehicle_version);
  -- Nomination holds the same driver profile lock as assignment finalization.
  if pool_private.driver_has_ride_conflict(v_actor, v_ride) then
    raise exception 'driver_unavailable' using errcode = 'PT424';
  end if;
  perform pool_private.reply_driver(p_id, p_revision + 1, 'accept', null, null, p_available_seats, p_restraints);
  update public.driver_proposals set is_driver_offer = true where id = p_id;
  return p_id;
end $$;

create function public.drive_offer_details(p_ride_ids uuid[])
returns table(ride_id uuid, ride_revision integer, rider_count integer, booster_count integer, child_seat_count integer)
language sql security invoker set search_path = '' as $$
  select * from pool_private.drive_offer_details(p_ride_ids)
$$;

create function public.offer_to_drive(
  p_id uuid, p_ride_id uuid, p_family_id uuid, p_revision integer,
  p_vehicle_id uuid, p_vehicle_version integer, p_available_seats integer, p_restraints boolean
) returns uuid language sql security invoker set search_path = '' as $$
  select pool_private.offer_to_drive(p_id, p_ride_id, p_family_id, p_revision,
    p_vehicle_id, p_vehicle_version, p_available_seats, p_restraints)
$$;

revoke all on function pool_private.driver_has_ride_conflict(uuid, public.rides) from public, anon, authenticated;
revoke all on function pool_private.drive_offer_details(uuid[]), public.drive_offer_details(uuid[]) from public, anon, authenticated;
revoke all on function pool_private.offer_to_drive(uuid, uuid, uuid, integer, uuid, integer, integer, boolean),
  public.offer_to_drive(uuid, uuid, uuid, integer, uuid, integer, integer, boolean) from public, anon, authenticated;
grant execute on function pool_private.drive_offer_details(uuid[]), public.drive_offer_details(uuid[]) to authenticated;
grant execute on function pool_private.offer_to_drive(uuid, uuid, uuid, integer, uuid, integer, integer, boolean),
  public.offer_to_drive(uuid, uuid, uuid, integer, uuid, integer, integer, boolean) to authenticated;
