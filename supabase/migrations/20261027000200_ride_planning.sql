-- R4: additive ride planning. No driver/assignment state is introduced.
create table public.children (
  id uuid primary key,
  family_id uuid not null references public.families(id),
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  seat_requirement text not null check (seat_requirement in ('standard', 'booster', 'child-seat')),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  unique(id, family_id)
);
create index children_family on public.children(family_id);
create table public.rides (
  id uuid primary key,
  circle_id uuid not null references public.circles(id),
  creator_family_id uuid not null,
  created_by uuid not null,
  pickup_summary text not null check (length(btrim(pickup_summary)) between 1 and 80),
  destination_summary text not null check (length(btrim(destination_summary)) between 1 and 80),
  direction text not null check (direction in ('outbound', 'return')),
  starts_at timestamptz not null check (isfinite(starts_at)),
  ends_at timestamptz not null check (isfinite(ends_at)),
  timezone text not null,
  revision integer not null default 1 check (revision > 0),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  -- Used only to recognize the same creation request after roster/cancellation changes.
  creation_digest bytea not null,
  check (ends_at > starts_at),
  check ((cancelled_at is null) = (cancelled_by is null)),
  foreign key (circle_id, creator_family_id) references public.circle_families(circle_id, family_id),
  foreign key (creator_family_id, created_by) references public.family_members(family_id, user_id),
  unique(id, circle_id)
);
create index rides_interval on public.rides(starts_at, ends_at);
create table public.ride_families (
  ride_id uuid not null,
  circle_id uuid not null,
  family_id uuid not null,
  status text not null check (status in ('invited', 'joined', 'declined', 'withdrawn')),
  responded_at timestamptz,
  primary key (ride_id, family_id),
  foreign key (ride_id, circle_id) references public.rides(id, circle_id),
  foreign key (circle_id, family_id) references public.circle_families(circle_id, family_id)
);
create index ride_families_family on public.ride_families(family_id, ride_id);
create table public.ride_riders (
  ride_id uuid not null,
  family_id uuid not null,
  child_id uuid not null,
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  seat_requirement text not null check (seat_requirement in ('standard', 'booster', 'child-seat')),
  primary key (ride_id, child_id),
  foreign key (ride_id, family_id) references public.ride_families(ride_id, family_id),
  foreign key (child_id, family_id) references public.children(id, family_id)
);
create index ride_riders_family on public.ride_riders(family_id, ride_id);
create table public.ride_locations (
  ride_id uuid primary key references public.rides(id),
  pickup text not null check (length(btrim(pickup)) between 1 and 300),
  destination text not null check (length(btrim(destination)) between 1 and 300),
  check (btrim(pickup) <> btrim(destination))
);

create function pool_private.valid_ride_timezone() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.timezone is null or (new.timezone <> 'UTC' and position('/' in new.timezone) = 0)
     or not exists(select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'invalid_timezone' using errcode = 'PT400';
  end if;
  return new;
end $$;
create trigger ride_timezone before insert or update on public.rides for each row execute function pool_private.valid_ride_timezone();

create function pool_private.ride_family_active(p_circle uuid, p_family uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.circle_families where circle_id = p_circle and family_id = p_family and removed_at is null)
$$;
create function pool_private.can_read_ride(p_ride uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.ride_families rf where rf.ride_id = p_ride and rf.status = 'joined'
    and pool_private.member_of(rf.family_id) and pool_private.ride_family_active(rf.circle_id, rf.family_id))
$$;
alter table public.children enable row level security;
alter table public.rides enable row level security;
alter table public.ride_families enable row level security;
alter table public.ride_riders enable row level security;
alter table public.ride_locations enable row level security;
revoke all on public.children, public.rides, public.ride_families, public.ride_riders, public.ride_locations from public, anon, authenticated;
grant select on public.children, public.rides, public.ride_families, public.ride_riders, public.ride_locations to authenticated;
create policy child_read on public.children for select to authenticated using (pool_private.member_of(family_id));
create policy ride_read on public.rides for select to authenticated using (pool_private.can_read_ride(id));
create policy ride_family_read on public.ride_families for select to authenticated using (
  pool_private.ride_family_active(circle_id, family_id) and
  (pool_private.can_read_ride(ride_id) or pool_private.member_of(family_id)));
create policy ride_rider_read on public.ride_riders for select to authenticated using (
  pool_private.can_read_ride(ride_id) and exists(select 1 from public.ride_families rf
    where rf.ride_id = ride_riders.ride_id and rf.family_id = ride_riders.family_id and rf.status = 'joined'
    and pool_private.ride_family_active(rf.circle_id, rf.family_id)));
create policy ride_location_read on public.ride_locations for select to authenticated using (pool_private.can_read_ride(ride_id));

-- Lock order matches R3 removals: family roots (sorted), circle, then ride.
-- No mutable JWT membership claims or coordinator bypass grants ride access.
create function pool_private.lock_own_ride(p_ride uuid, p_family uuid) returns public.rides language plpgsql security definer set search_path = '' as $$
declare v_ride public.rides;
begin
  perform pool_private.require_actor();
  perform 1 from public.families where id = p_family for update;
  select * into v_ride from public.rides where id = p_ride;
  if not found then raise exception 'unavailable' using errcode = 'PT404'; end if;
  perform 1 from public.circles where id = v_ride.circle_id for update;
  select * into v_ride from public.rides where id = p_ride for update;
  if not pool_private.member_of(p_family) or not pool_private.ride_family_active(v_ride.circle_id, p_family)
    or not exists(select 1 from public.ride_families where ride_id = p_ride and family_id = p_family) then
    raise exception 'unavailable' using errcode = 'PT404'; end if;
  return v_ride;
end $$;
create function pool_private.check_ride_revision(p_ride public.rides, p_revision integer) returns void language plpgsql set search_path = '' as $$
begin
  if p_revision is null or p_ride.revision <> p_revision or p_ride.cancelled_at is not null then
    raise exception 'stale_or_cancelled' using errcode = 'PT409'; end if;
end $$;
create function pool_private.validate_own_riders(p_family uuid, p_children uuid[], p_require boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_children is null or cardinality(p_children) > 50 or (p_require and cardinality(p_children) = 0)
    or cardinality(p_children) <> (select count(distinct id) from unnest(p_children) id)
    or exists(select 1 from unnest(p_children) as requested(child_id) where not exists(select 1 from public.children c where c.id = requested.child_id and c.family_id = p_family)) then
    raise exception 'invalid_riders' using errcode = 'PT400'; end if;
end $$;
create function pool_private.replace_ride_riders(p_ride uuid, p_family uuid, p_children uuid[]) returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.ride_riders where ride_id = p_ride and family_id = p_family;
  insert into public.ride_riders(ride_id, family_id, child_id, display_name, seat_requirement)
    select p_ride, p_family, id, display_name, seat_requirement from public.children where id = any(p_children) and family_id = p_family;
end $$;
create function pool_private.save_own_child(p_id uuid, p_family_id uuid, p_display_name text, p_seat_requirement text, p_revision integer) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_child public.children;
begin
  perform pool_private.require_actor();
  perform 1 from public.families where id = p_family_id for update;
  if not pool_private.member_of(p_family_id) then raise exception 'unavailable' using errcode = 'PT404'; end if;
  if p_id is null or p_revision is null or p_revision < 0 or p_display_name is null or length(btrim(p_display_name)) not between 1 and 80
    or p_seat_requirement is null or p_seat_requirement not in ('standard', 'booster', 'child-seat') then raise exception 'validation' using errcode = 'PT400'; end if;
  select * into v_child from public.children where id = p_id for update;
  if found then
    if v_child.family_id <> p_family_id then raise exception 'unavailable' using errcode = 'PT404'; end if;
    if p_revision = 0 and v_child.revision = 1 and v_child.display_name = btrim(p_display_name) and v_child.seat_requirement = p_seat_requirement then return p_id; end if;
    if v_child.revision <> p_revision then raise exception 'stale' using errcode = 'PT409'; end if;
    update public.children set display_name = btrim(p_display_name), seat_requirement = p_seat_requirement, revision = revision + 1 where id = p_id;
  else
    if p_revision <> 0 then raise exception 'stale' using errcode = 'PT409'; end if;
    insert into public.children(id, family_id, display_name, seat_requirement) values(p_id, p_family_id, btrim(p_display_name), p_seat_requirement);
  end if;
  -- Existing enrollments remain frozen ride-specific snapshots.
  return p_id;
end $$;
create function pool_private.create_ride(p_id uuid, p_family_id uuid, p_circle_id uuid, p_pickup_summary text, p_destination_summary text, p_pickup text, p_destination text, p_direction text, p_starts_at timestamptz, p_ends_at timestamptz, p_timezone text, p_child_ids uuid[], p_invited_family_ids uuid[]) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := pool_private.require_actor(); v_existing public.rides; v_digest bytea;
begin
  if p_id is null or p_invited_family_ids is null or cardinality(p_invited_family_ids) > 50
    or cardinality(p_invited_family_ids) <> (select count(distinct id) from unnest(p_invited_family_ids) id)
    or p_family_id = any(p_invited_family_ids) then raise exception 'validation' using errcode = 'PT400'; end if;
  perform 1 from public.families where id = any(array_append(p_invited_family_ids, p_family_id)) order by id for update;
  perform 1 from public.circles where id = p_circle_id for update;
  if not pool_private.member_of(p_family_id) or not pool_private.ride_family_active(p_circle_id, p_family_id) then raise exception 'unavailable' using errcode = 'PT404'; end if;
  if exists(select 1 from unnest(p_invited_family_ids) id where not pool_private.ride_family_active(p_circle_id, id)) then raise exception 'validation' using errcode = 'PT400'; end if;
  perform pool_private.validate_own_riders(p_family_id, p_child_ids, true);
  if p_pickup_summary is null or length(btrim(p_pickup_summary)) not between 1 and 80
    or p_destination_summary is null or length(btrim(p_destination_summary)) not between 1 and 80
    or p_pickup is null or length(btrim(p_pickup)) not between 1 and 300
    or p_destination is null or length(btrim(p_destination)) not between 1 and 300 or btrim(p_pickup) = btrim(p_destination)
    or p_direction is null or p_direction not in ('outbound', 'return') or p_starts_at is null or p_ends_at is null
    or not isfinite(p_starts_at) or not isfinite(p_ends_at) or p_ends_at <= p_starts_at then raise exception 'validation' using errcode = 'PT400'; end if;
  v_digest := extensions.digest(jsonb_build_array(p_family_id, p_circle_id, btrim(p_pickup_summary), btrim(p_destination_summary), btrim(p_pickup), btrim(p_destination), p_direction, extract(epoch from p_starts_at), extract(epoch from p_ends_at), p_timezone,
    (select jsonb_agg(id order by id) from unnest(p_child_ids) id), (select jsonb_agg(id order by id) from unnest(p_invited_family_ids) id))::text, 'sha256');
  select * into v_existing from public.rides where id = p_id for update;
  if found then
    if v_existing.created_by <> v_actor or v_existing.creator_family_id <> p_family_id then raise exception 'unavailable' using errcode = 'PT404'; end if;
    if v_existing.creation_digest <> v_digest then raise exception 'duplicate_key' using errcode = 'PT409'; end if;
    return p_id; -- A creation retry never changes/reopens a cancelled ride.
  end if;
  insert into public.rides(id, circle_id, creator_family_id, created_by, pickup_summary, destination_summary, direction, starts_at, ends_at, timezone, creation_digest)
    values(p_id, p_circle_id, p_family_id, v_actor, btrim(p_pickup_summary), btrim(p_destination_summary), p_direction, p_starts_at, p_ends_at, p_timezone, v_digest);
  insert into public.ride_locations values(p_id, btrim(p_pickup), btrim(p_destination));
  insert into public.ride_families(ride_id, circle_id, family_id, status, responded_at) values(p_id, p_circle_id, p_family_id, 'joined', now());
  insert into public.ride_families(ride_id, circle_id, family_id, status) select p_id, p_circle_id, id, 'invited' from unnest(p_invited_family_ids) id;
  perform pool_private.replace_ride_riders(p_id, p_family_id, p_child_ids);
  return p_id;
end $$;
create function pool_private.respond_to_ride_invitation(p_ride_id uuid, p_family_id uuid, p_revision integer, p_accept boolean, p_child_ids uuid[]) returns integer language plpgsql security definer set search_path = '' as $$
declare v_ride public.rides := pool_private.lock_own_ride(p_ride_id, p_family_id); v_status text;
begin
  perform pool_private.check_ride_revision(v_ride, p_revision);
  select status into v_status from public.ride_families where ride_id = p_ride_id and family_id = p_family_id;
  if v_status = 'joined' then raise exception 'already_joined' using errcode = 'PT409'; end if;
  if p_accept is null or p_child_ids is null or (not p_accept and cardinality(p_child_ids) <> 0) then raise exception 'validation' using errcode = 'PT400'; end if;
  perform pool_private.validate_own_riders(p_family_id, p_child_ids, p_accept);
  update public.ride_families set status = case when p_accept then 'joined' else 'declined' end, responded_at = now() where ride_id = p_ride_id and family_id = p_family_id;
  perform pool_private.replace_ride_riders(p_ride_id, p_family_id, p_child_ids);
  update public.rides set revision = revision + 1 where id = p_ride_id returning revision into p_revision;
  return p_revision;
end $$;
create function pool_private.set_own_ride_riders(p_ride_id uuid, p_family_id uuid, p_revision integer, p_child_ids uuid[]) returns integer language plpgsql security definer set search_path = '' as $$
declare v_ride public.rides := pool_private.lock_own_ride(p_ride_id, p_family_id);
begin
  perform pool_private.check_ride_revision(v_ride, p_revision);
  if not exists(select 1 from public.ride_families where ride_id = p_ride_id and family_id = p_family_id and status = 'joined') then raise exception 'unavailable' using errcode = 'PT404'; end if;
  perform pool_private.validate_own_riders(p_family_id, p_child_ids, false);
  perform pool_private.replace_ride_riders(p_ride_id, p_family_id, p_child_ids);
  update public.ride_families set status = case when cardinality(p_child_ids) = 0 then 'withdrawn' else 'joined' end, responded_at = now() where ride_id = p_ride_id and family_id = p_family_id;
  update public.rides set revision = revision + 1 where id = p_ride_id returning revision into p_revision;
  return p_revision;
end $$;
create function pool_private.cancel_ride(p_ride_id uuid, p_family_id uuid, p_revision integer) returns integer language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := pool_private.require_actor(); v_ride public.rides := pool_private.lock_own_ride(p_ride_id, p_family_id);
begin
  if v_ride.created_by <> v_actor or v_ride.creator_family_id <> p_family_id then raise exception 'unavailable' using errcode = 'PT404'; end if;
  perform pool_private.check_ride_revision(v_ride, p_revision);
  update public.rides set cancelled_at = clock_timestamp(), cancelled_by = v_actor, revision = revision + 1 where id = p_ride_id returning revision into p_revision;
  return p_revision;
end $$;

-- Minimal offers only; neither exact locations nor child IDs/names are returned.
create function pool_private.ride_offers(p_from timestamptz, p_until timestamptz) returns table(id uuid, family_id uuid, circle_id uuid, pickup_summary text, destination_summary text, direction text, starts_at timestamptz, ends_at timestamptz, timezone text, revision integer, cancelled_at timestamptz, status text, can_cancel boolean) language plpgsql security definer set search_path = '' as $$
begin
  perform pool_private.require_actor();
  if p_from is null or p_until is null or not isfinite(p_from) or not isfinite(p_until) or p_until <= p_from or p_until - p_from > interval '370 days' then raise exception 'validation' using errcode = 'PT400'; end if;
  return query select r.id, rf.family_id, r.circle_id, r.pickup_summary, r.destination_summary, r.direction, r.starts_at, r.ends_at, r.timezone, r.revision, r.cancelled_at, rf.status,
    r.created_by = pool_private.actor() and r.creator_family_id = rf.family_id
    from public.rides r join public.ride_families rf on rf.ride_id = r.id
    where pool_private.member_of(rf.family_id) and pool_private.ride_family_active(r.circle_id, rf.family_id)
      and r.starts_at < p_until and r.ends_at > p_from order by r.starts_at, r.id, rf.family_id;
end $$;
create function pool_private.ride_offer(p_id uuid) returns table(id uuid, family_id uuid, circle_id uuid, pickup_summary text, destination_summary text, direction text, starts_at timestamptz, ends_at timestamptz, timezone text, revision integer, cancelled_at timestamptz, status text, can_cancel boolean) language plpgsql security definer set search_path = '' as $$
begin
  perform pool_private.require_actor();
  return query select r.id, rf.family_id, r.circle_id, r.pickup_summary, r.destination_summary, r.direction, r.starts_at, r.ends_at, r.timezone, r.revision, r.cancelled_at, rf.status,
    r.created_by = pool_private.actor() and r.creator_family_id = rf.family_id
    from public.rides r join public.ride_families rf on rf.ride_id = r.id
    where r.id = p_id and pool_private.member_of(rf.family_id) and pool_private.ride_family_active(r.circle_id, rf.family_id);
end $$;
create function public.save_own_child(p_id uuid, p_family_id uuid, p_display_name text, p_seat_requirement text, p_revision integer) returns uuid language sql security invoker set search_path = '' as $$ select pool_private.save_own_child(p_id, p_family_id, p_display_name, p_seat_requirement, p_revision) $$;
revoke all on function public.save_own_child(uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.save_own_child(uuid, uuid, text, text, integer) to authenticated;
revoke all on function pool_private.save_own_child(uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function pool_private.save_own_child(uuid, uuid, text, text, integer) to authenticated;
create function public.create_ride(p_id uuid, p_family_id uuid, p_circle_id uuid, p_pickup_summary text, p_destination_summary text, p_pickup text, p_destination text, p_direction text, p_starts_at timestamptz, p_ends_at timestamptz, p_timezone text, p_child_ids uuid[], p_invited_family_ids uuid[]) returns uuid language sql security invoker set search_path = '' as $$ select pool_private.create_ride(p_id, p_family_id, p_circle_id, p_pickup_summary, p_destination_summary, p_pickup, p_destination, p_direction, p_starts_at, p_ends_at, p_timezone, p_child_ids, p_invited_family_ids) $$;
revoke all on function public.create_ride(uuid, uuid, uuid, text, text, text, text, text, timestamptz, timestamptz, text, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.create_ride(uuid, uuid, uuid, text, text, text, text, text, timestamptz, timestamptz, text, uuid[], uuid[]) to authenticated;
revoke all on function pool_private.create_ride(uuid, uuid, uuid, text, text, text, text, text, timestamptz, timestamptz, text, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function pool_private.create_ride(uuid, uuid, uuid, text, text, text, text, text, timestamptz, timestamptz, text, uuid[], uuid[]) to authenticated;
create function public.respond_to_ride_invitation(p_ride_id uuid, p_family_id uuid, p_revision integer, p_accept boolean, p_child_ids uuid[]) returns integer language sql security invoker set search_path = '' as $$ select pool_private.respond_to_ride_invitation(p_ride_id, p_family_id, p_revision, p_accept, p_child_ids) $$;
revoke all on function public.respond_to_ride_invitation(uuid, uuid, integer, boolean, uuid[]) from public, anon, authenticated;
grant execute on function public.respond_to_ride_invitation(uuid, uuid, integer, boolean, uuid[]) to authenticated;
revoke all on function pool_private.respond_to_ride_invitation(uuid, uuid, integer, boolean, uuid[]) from public, anon, authenticated;
grant execute on function pool_private.respond_to_ride_invitation(uuid, uuid, integer, boolean, uuid[]) to authenticated;
create function public.set_own_ride_riders(p_ride_id uuid, p_family_id uuid, p_revision integer, p_child_ids uuid[]) returns integer language sql security invoker set search_path = '' as $$ select pool_private.set_own_ride_riders(p_ride_id, p_family_id, p_revision, p_child_ids) $$;
revoke all on function public.set_own_ride_riders(uuid, uuid, integer, uuid[]) from public, anon, authenticated;
grant execute on function public.set_own_ride_riders(uuid, uuid, integer, uuid[]) to authenticated;
revoke all on function pool_private.set_own_ride_riders(uuid, uuid, integer, uuid[]) from public, anon, authenticated;
grant execute on function pool_private.set_own_ride_riders(uuid, uuid, integer, uuid[]) to authenticated;
create function public.cancel_ride(p_ride_id uuid, p_family_id uuid, p_revision integer) returns integer language sql security invoker set search_path = '' as $$ select pool_private.cancel_ride(p_ride_id, p_family_id, p_revision) $$;
revoke all on function public.cancel_ride(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.cancel_ride(uuid, uuid, integer) to authenticated;
revoke all on function pool_private.cancel_ride(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function pool_private.cancel_ride(uuid, uuid, integer) to authenticated;
create function public.ride_offers(p_from timestamptz, p_until timestamptz) returns table(id uuid, family_id uuid, circle_id uuid, pickup_summary text, destination_summary text, direction text, starts_at timestamptz, ends_at timestamptz, timezone text, revision integer, cancelled_at timestamptz, status text, can_cancel boolean) language sql security invoker set search_path = '' as $$ select * from pool_private.ride_offers(p_from, p_until) $$;
revoke all on function public.ride_offers(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.ride_offers(timestamptz, timestamptz) to authenticated;
revoke all on function pool_private.ride_offers(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function pool_private.ride_offers(timestamptz, timestamptz) to authenticated;
create function public.ride_offer(p_id uuid) returns table(id uuid, family_id uuid, circle_id uuid, pickup_summary text, destination_summary text, direction text, starts_at timestamptz, ends_at timestamptz, timezone text, revision integer, cancelled_at timestamptz, status text, can_cancel boolean) language sql security invoker set search_path = '' as $$ select * from pool_private.ride_offer(p_id) $$;
revoke all on function public.ride_offer(uuid) from public, anon, authenticated;
grant execute on function public.ride_offer(uuid) to authenticated;
revoke all on function pool_private.ride_offer(uuid) from public, anon, authenticated;
grant execute on function pool_private.ride_offer(uuid) to authenticated;
revoke all on function pool_private.valid_ride_timezone() from public, anon, authenticated;
revoke all on function pool_private.ride_family_active(uuid,uuid) from public, anon, authenticated;
revoke all on function pool_private.can_read_ride(uuid) from public, anon, authenticated;
revoke all on function pool_private.lock_own_ride(uuid,uuid) from public, anon, authenticated;
revoke all on function pool_private.check_ride_revision(public.rides,integer) from public, anon, authenticated;
revoke all on function pool_private.validate_own_riders(uuid,uuid[],boolean) from public, anon, authenticated;
revoke all on function pool_private.replace_ride_riders(uuid,uuid,uuid[]) from public, anon, authenticated;
grant execute on function pool_private.ride_family_active(uuid,uuid) to authenticated;
grant execute on function pool_private.can_read_ride(uuid) to authenticated;
