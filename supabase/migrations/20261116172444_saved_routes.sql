create table public.saved_routes (
  family_id uuid not null references public.families(id),
  id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 80),
  pickup_summary text not null check (length(btrim(pickup_summary)) between 1 and 80),
  destination_summary text not null check (length(btrim(destination_summary)) between 1 and 80),
  pickup text not null check (length(btrim(pickup)) between 1 and 300),
  destination text not null check (length(btrim(destination)) between 1 and 300),
  check (btrim(pickup) <> btrim(destination)),
  primary key (family_id, id)
);
create unique index saved_routes_family_name on public.saved_routes (family_id, lower(name));

alter table public.saved_routes enable row level security;
revoke all on public.saved_routes from public, anon, authenticated;
grant select on public.saved_routes to authenticated;
create policy saved_route_read on public.saved_routes for select to authenticated
  using (pool_private.member_of(family_id));

create function pool_private.save_route(
  p_family_id uuid, p_id uuid, p_name text, p_pickup_summary text,
  p_destination_summary text, p_pickup text, p_destination text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  existing public.saved_routes;
begin
  perform pool_private.require_actor();
  -- Serialize with family membership removal and other saves for this family.
  perform 1 from public.families where id = p_family_id for update;
  if not pool_private.member_of(p_family_id) then
    raise exception 'unavailable' using errcode = 'PT404';
  end if;

  p_name := btrim(p_name);
  p_pickup_summary := btrim(p_pickup_summary);
  p_destination_summary := btrim(p_destination_summary);
  p_pickup := btrim(p_pickup);
  p_destination := btrim(p_destination);
  if p_id is null or p_name is null or p_pickup_summary is null
    or p_destination_summary is null or p_pickup is null or p_destination is null then
    raise exception 'validation' using errcode = 'PT400';
  end if;

  select * into existing from public.saved_routes
    where family_id = p_family_id and id = p_id;
  if found then
    if (existing.name, existing.pickup_summary, existing.destination_summary,
      existing.pickup, existing.destination) =
      (p_name, p_pickup_summary, p_destination_summary, p_pickup, p_destination) then
      return p_id;
    end if;
    raise exception 'duplicate_request' using errcode = 'PT409';
  end if;

  insert into public.saved_routes (family_id, id, name, pickup_summary, destination_summary, pickup, destination)
    values (p_family_id, p_id, p_name, p_pickup_summary, p_destination_summary, p_pickup, p_destination);
  return p_id;
end $$;

create function public.save_route(
  p_family_id uuid, p_id uuid, p_name text, p_pickup_summary text,
  p_destination_summary text, p_pickup text, p_destination text
) returns uuid language sql security invoker set search_path = '' as $$
  select pool_private.save_route(
    p_family_id, p_id, p_name, p_pickup_summary, p_destination_summary, p_pickup, p_destination
  )
$$;

revoke all on function public.save_route(uuid, uuid, text, text, text, text, text),
  pool_private.save_route(uuid, uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.save_route(uuid, uuid, text, text, text, text, text),
  pool_private.save_route(uuid, uuid, text, text, text, text, text)
  to authenticated;
