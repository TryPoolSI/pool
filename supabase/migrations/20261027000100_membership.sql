-- R3 is additive. All protected writes go through authenticated commands.
create schema if not exists pool_private;
revoke all on schema pool_private from public, anon;
grant usage on schema pool_private to authenticated;
create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id),
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  created_at timestamptz not null default now()
);
create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);
create table public.family_members (
  family_id uuid not null references public.families(id),
  user_id uuid not null references public.profiles(id),
  role text not null check (role in ('owner', 'guardian')),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (family_id, user_id)
);
create index family_members_user on public.family_members(user_id, family_id) where removed_at is null;
create table public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  coordinator_id uuid not null,
  coordinator_family_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (coordinator_family_id, coordinator_id) references public.family_members(family_id, user_id)
);
create table public.circle_families (
  circle_id uuid not null references public.circles(id),
  family_id uuid not null references public.families(id),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (circle_id, family_id)
);
create index circle_families_family on public.circle_families(family_id, circle_id) where removed_at is null;
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('guardian', 'circle')),
  family_id uuid references public.families(id),
  circle_id uuid references public.circles(id),
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  token_digest bytea not null unique check (octet_length(token_digest) = 32),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  revoked_at timestamptz,
  consumed_at timestamptz,
  consumed_by uuid references public.profiles(id),
  accepted_family_id uuid references public.families(id),
  check ((kind = 'guardian' and family_id is not null and circle_id is null) or
         (kind = 'circle' and circle_id is not null and family_id is null)),
  check (expires_at > created_at),
  check ((consumed_at is null and consumed_by is null and accepted_family_id is null) or
         (consumed_at is not null and consumed_by is not null and accepted_family_id is not null))
);
create index invitations_family on public.invitations(family_id);
create index invitations_circle on public.invitations(circle_id);

-- Check the current Auth record, never mutable/stale client metadata or role claims.
create function pool_private.actor() returns uuid language sql stable security definer set search_path = '' as $$
  select id from auth.users where id = auth.uid() and email_confirmed_at is not null
    and email is not null and not is_anonymous and deleted_at is null
    and (banned_until is null or banned_until <= now())
$$;
create function pool_private.member_of(p_family uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.family_members where family_id = p_family
    and user_id = pool_private.actor() and removed_at is null)
$$;
create function pool_private.owns_family(p_family uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.family_members where family_id = p_family
    and user_id = pool_private.actor() and role = 'owner' and removed_at is null)
$$;
create function pool_private.in_circle(p_circle uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.circle_families cf join public.family_members fm using (family_id)
    where cf.circle_id = p_circle and cf.removed_at is null and fm.removed_at is null and fm.user_id = pool_private.actor())
$$;
create function pool_private.coordinates(p_circle uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.circles c where c.id = p_circle and c.coordinator_id = pool_private.actor()
    and pool_private.owns_family(c.coordinator_family_id) and pool_private.in_circle(c.id))
$$;
create function pool_private.can_read_profile(p_user uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select p_user = pool_private.actor() or exists(select 1 from public.family_members fm
    where fm.user_id = p_user and fm.removed_at is null and pool_private.member_of(fm.family_id))
$$;

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.circles enable row level security;
alter table public.circle_families enable row level security;
alter table public.invitations enable row level security;
revoke all on public.profiles, public.families, public.family_members, public.circles, public.circle_families, public.invitations from public, anon, authenticated;
grant select on public.profiles, public.families, public.family_members, public.circles, public.circle_families to authenticated;
create policy profile_read on public.profiles for select to authenticated using (pool_private.can_read_profile(id));
create policy family_read on public.families for select to authenticated using (pool_private.member_of(id));
create policy family_member_read on public.family_members for select to authenticated using (removed_at is null and pool_private.member_of(family_id));
create policy circle_read on public.circles for select to authenticated using (pool_private.in_circle(id));
create policy circle_family_read on public.circle_families for select to authenticated using (removed_at is null and pool_private.in_circle(circle_id));
-- No invitation SELECT policy or grant, including for owners. Safe projections below.

create function pool_private.require_actor() returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := pool_private.actor();
begin
  if v_actor is null then raise exception 'unauthenticated' using errcode = 'PT401'; end if;
  return v_actor;
end $$;

create function pool_private.create_family(p_name text, p_display_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := pool_private.require_actor(); v_id uuid;
begin
  if p_name is null or length(btrim(p_name)) not between 1 and 80 or p_display_name is null or length(btrim(p_display_name)) not between 1 and 80 then
    raise exception 'validation' using errcode = 'PT400'; end if;
  insert into public.profiles(id, display_name) values (v_actor, btrim(p_display_name)) on conflict (id) do nothing;
  insert into public.families(name) values (btrim(p_name)) returning id into v_id;
  insert into public.family_members(family_id, user_id, role) values (v_id, v_actor, 'owner');
  return v_id;
end $$;
create function pool_private.create_circle(p_family_id uuid, p_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := pool_private.require_actor(); v_id uuid;
begin
  perform 1 from public.families where id = p_family_id for update;
  if not pool_private.owns_family(p_family_id) then raise exception 'not_found' using errcode = 'PT404'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 80 then raise exception 'validation' using errcode = 'PT400'; end if;
  insert into public.circles(name, coordinator_id, coordinator_family_id) values (btrim(p_name), v_actor, p_family_id) returning id into v_id;
  insert into public.circle_families(circle_id, family_id) values (v_id, p_family_id);
  return v_id;
end $$;

-- Root locks serialize authority changes with invitation creation/acceptance.
create function pool_private.lock_scope(p_kind text, p_scope_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_kind = 'guardian' then perform 1 from public.families where id = p_scope_id for update;
  elsif p_kind = 'circle' then perform 1 from public.circles where id = p_scope_id for update;
  else raise exception 'validation' using errcode = 'PT400'; end if;
end $$;
create function pool_private.administers(p_kind text, p_scope_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select case p_kind when 'guardian' then pool_private.owns_family(p_scope_id) when 'circle' then pool_private.coordinates(p_scope_id) else false end
$$;
create function pool_private.inviter_authorized(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.invitations i where i.id = p_id and (
    (i.kind = 'guardian' and exists(select 1 from public.family_members fm where fm.family_id = i.family_id
      and fm.user_id = i.created_by and fm.role = 'owner' and fm.removed_at is null)) or
    (i.kind = 'circle' and exists(select 1 from public.circles c join public.family_members fm
      on fm.family_id = c.coordinator_family_id and fm.user_id = c.coordinator_id
      join public.circle_families cf on cf.circle_id = c.id and cf.family_id = c.coordinator_family_id
      where c.id = i.circle_id and c.coordinator_id = i.created_by and fm.role = 'owner'
      and fm.removed_at is null and cf.removed_at is null))))
$$;
create function pool_private.create_invitation(p_kind text, p_scope_id uuid, p_email text) returns table(invitation_id uuid, token text) language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := pool_private.require_actor(); v_token text := encode(extensions.gen_random_bytes(32), 'hex'); v_id uuid;
begin
  perform pool_private.lock_scope(p_kind, p_scope_id);
  if not pool_private.administers(p_kind, p_scope_id) then raise exception 'not_found' using errcode = 'PT404'; end if;
  if p_email is null or length(btrim(p_email)) not between 3 and 254 or btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'validation' using errcode = 'PT400'; end if;
  insert into public.invitations(kind, family_id, circle_id, email, token_digest, created_by)
    values(p_kind, case when p_kind = 'guardian' then p_scope_id end, case when p_kind = 'circle' then p_scope_id end,
      lower(btrim(p_email)), extensions.digest(v_token, 'sha256'), v_actor) returning id into v_id;
  return query select v_id, v_token;
end $$;

-- The summary reveals only the target's label, and only to the verified recipient.
create function pool_private.invitation_preview(p_kind text, p_token text) returns table(scope_name text, expires_at timestamptz) language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := pool_private.require_actor(); v_inv public.invitations; v_email text;
begin
  select lower(email) into v_email from auth.users where id = v_actor;
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'unavailable' using errcode = 'PT404'; end if;
  select * into v_inv from public.invitations where token_digest = extensions.digest(p_token, 'sha256') and kind = p_kind;
  if not found or v_inv.email <> v_email then raise exception 'unavailable' using errcode = 'PT404'; end if;
  if v_inv.revoked_at is not null or v_inv.consumed_at is not null or v_inv.expires_at <= clock_timestamp() or not pool_private.inviter_authorized(v_inv.id) then raise exception 'expired_or_used' using errcode = 'PT410'; end if;
  return query select coalesce(f.name, c.name), v_inv.expires_at from (select 1) x
    left join public.families f on f.id = v_inv.family_id left join public.circles c on c.id = v_inv.circle_id;
end $$;

create function pool_private.accept_invitation(p_kind text, p_token text, p_family_id uuid, p_new_family_name text, p_display_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := pool_private.require_actor(); v_inv public.invitations; v_email text; v_family uuid := p_family_id;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'unavailable' using errcode = 'PT404'; end if;
  -- Read context without locking, then use one consistent order: receiving family,
  -- scope root, invitation. Re-read the invitation after waiting for the locks.
  select * into v_inv from public.invitations where token_digest = extensions.digest(p_token, 'sha256') and kind = p_kind;
  if not found then raise exception 'unavailable' using errcode = 'PT404'; end if;
  if p_kind = 'circle' then
    if (p_family_id is null) = (p_new_family_name is null) then raise exception 'validation' using errcode = 'PT400'; end if;
    if p_family_id is null then v_family := pool_private.create_family(p_new_family_name, p_display_name); end if;
    perform 1 from public.families where id = v_family for update;
    if not pool_private.owns_family(v_family) then raise exception 'not_found' using errcode = 'PT404'; end if;
  elsif p_kind = 'guardian' then
    if p_family_id is not null or p_new_family_name is not null then raise exception 'validation' using errcode = 'PT400'; end if;
    v_family := v_inv.family_id;
  else raise exception 'validation' using errcode = 'PT400'; end if;
  perform pool_private.lock_scope(p_kind, coalesce(v_inv.family_id, v_inv.circle_id));
  select * into v_inv from public.invitations where id = v_inv.id for update;
  -- Prevent an email change racing acceptance; use current, confirmed Auth data.
  select lower(email) into v_email from auth.users where id = v_actor and email_confirmed_at is not null and not is_anonymous for share;
  if v_email is null or v_inv.email <> v_email then raise exception 'unavailable' using errcode = 'PT404'; end if;
  if v_inv.revoked_at is not null or v_inv.consumed_at is not null or v_inv.expires_at <= clock_timestamp() or not pool_private.inviter_authorized(v_inv.id) then raise exception 'expired_or_used' using errcode = 'PT410'; end if;
  if p_display_name is null or length(btrim(p_display_name)) not between 1 and 80 then raise exception 'validation' using errcode = 'PT400'; end if;
  insert into public.profiles(id, display_name) values (v_actor, btrim(p_display_name)) on conflict(id) do nothing;
  if p_kind = 'guardian' then
    if exists(select 1 from public.family_members where family_id = v_family and user_id = v_actor and removed_at is null) then raise exception 'already_member' using errcode = 'PT409'; end if;
    insert into public.family_members(family_id, user_id, role) values (v_family, v_actor, 'guardian')
      on conflict(family_id, user_id) do update set role = 'guardian', joined_at = now(), removed_at = null;
  else
    if exists(select 1 from public.circle_families where circle_id = v_inv.circle_id and family_id = v_family and removed_at is null) then raise exception 'already_member' using errcode = 'PT409'; end if;
    insert into public.circle_families(circle_id, family_id) values (v_inv.circle_id, v_family)
      on conflict(circle_id, family_id) do update set joined_at = now(), removed_at = null;
  end if;
  update public.invitations set consumed_at = clock_timestamp(), consumed_by = v_actor, accepted_family_id = v_family where id = v_inv.id;
  return v_family;
end $$;

create function pool_private.revoke_invitation(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_inv public.invitations;
begin
  perform pool_private.require_actor();
  select * into v_inv from public.invitations where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'PT404'; end if;
  perform pool_private.lock_scope(v_inv.kind, coalesce(v_inv.family_id, v_inv.circle_id));
  if not pool_private.administers(v_inv.kind, coalesce(v_inv.family_id, v_inv.circle_id)) then raise exception 'not_found' using errcode = 'PT404'; end if;
  update public.invitations set revoked_at = coalesce(revoked_at, clock_timestamp()) where id = p_id and consumed_at is null;
end $$;
create function pool_private.remove_family_member(p_family_id uuid, p_user_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := pool_private.require_actor(); v_role text;
begin
  perform 1 from public.families where id = p_family_id for update;
  if not pool_private.member_of(p_family_id) or (v_actor <> p_user_id and not pool_private.owns_family(p_family_id)) then raise exception 'not_found' using errcode = 'PT404'; end if;
  select role into v_role from public.family_members where family_id = p_family_id and user_id = p_user_id and removed_at is null;
  if not found then raise exception 'not_found' using errcode = 'PT404'; end if;
  if v_role = 'owner' and (select count(*) from public.family_members where family_id = p_family_id and role = 'owner' and removed_at is null) <= 1 then
    raise exception 'last_owner' using errcode = 'PT409'; end if;
  if exists(select 1 from public.circles where coordinator_family_id = p_family_id and coordinator_id = p_user_id) then raise exception 'coordinator_required' using errcode = 'PT409'; end if;
  update public.family_members set removed_at = clock_timestamp() where family_id = p_family_id and user_id = p_user_id;
  update public.invitations set revoked_at = coalesce(revoked_at, clock_timestamp()) where family_id = p_family_id and consumed_at is null
    and (created_by = p_user_id or email = (select lower(email) from auth.users where id = p_user_id));
end $$;
create function pool_private.remove_circle_family(p_circle_id uuid, p_family_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pool_private.require_actor();
  -- Family first matches acceptance/create-circle and serializes owner authority.
  perform 1 from public.families where id = p_family_id for update;
  perform pool_private.lock_scope('circle', p_circle_id);
  if not pool_private.coordinates(p_circle_id) and not (pool_private.owns_family(p_family_id) and pool_private.in_circle(p_circle_id)) then raise exception 'not_found' using errcode = 'PT404'; end if;
  if exists(select 1 from public.circles where id = p_circle_id and coordinator_family_id = p_family_id) then raise exception 'coordinator_required' using errcode = 'PT409'; end if;
  update public.circle_families set removed_at = clock_timestamp() where circle_id = p_circle_id and family_id = p_family_id and removed_at is null;
  if not found then raise exception 'not_found' using errcode = 'PT404'; end if;
  update public.invitations i set revoked_at = coalesce(i.revoked_at, clock_timestamp()) where i.circle_id = p_circle_id and i.consumed_at is null
    and i.email in (select lower(u.email) from auth.users u join public.family_members fm on fm.user_id = u.id
      where fm.family_id = p_family_id and fm.role = 'owner' and fm.removed_at is null);
end $$;
create function pool_private.list_invitations(p_kind text, p_scope_id uuid) returns table(id uuid, email text, created_at timestamptz, expires_at timestamptz, revoked_at timestamptz, consumed_at timestamptz) language plpgsql security definer set search_path = '' as $$
begin
  perform pool_private.require_actor();
  if not pool_private.administers(p_kind, p_scope_id) then raise exception 'not_found' using errcode = 'PT404'; end if;
  return query select i.id, i.email, i.created_at, i.expires_at, i.revoked_at, i.consumed_at from public.invitations i
    where i.kind = p_kind and coalesce(i.family_id, i.circle_id) = p_scope_id order by i.created_at desc limit 100;
end $$;
create function pool_private.circle_roster(p_circle_id uuid) returns table(family_id uuid, family_name text) language plpgsql security definer set search_path = '' as $$
begin
  perform pool_private.require_actor();
  if not pool_private.in_circle(p_circle_id) then raise exception 'not_found' using errcode = 'PT404'; end if;
  return query select f.id, f.name from public.circle_families cf join public.families f on f.id = cf.family_id
    where cf.circle_id = p_circle_id and cf.removed_at is null order by f.name;
end $$;

-- Exposed wrappers are invokers. Only these narrow, checked implementations and
-- nonrecursive RLS helpers are executable; lock/actor internals stay private.
create function public.create_family(p_name text, p_display_name text) returns uuid language sql security invoker set search_path = '' as $$ select pool_private.create_family(p_name, p_display_name) $$;
create function public.create_circle(p_family_id uuid, p_name text) returns uuid language sql security invoker set search_path = '' as $$ select pool_private.create_circle(p_family_id, p_name) $$;
create function public.create_invitation(p_kind text, p_scope_id uuid, p_email text) returns table(invitation_id uuid, token text) language sql security invoker set search_path = '' as $$ select * from pool_private.create_invitation(p_kind, p_scope_id, p_email) $$;
create function public.invitation_preview(p_kind text, p_token text) returns table(scope_name text, expires_at timestamptz) language sql security invoker set search_path = '' as $$ select * from pool_private.invitation_preview(p_kind, p_token) $$;
create function public.accept_invitation(p_kind text, p_token text, p_family_id uuid default null, p_new_family_name text default null, p_display_name text default null) returns uuid language sql security invoker set search_path = '' as $$ select pool_private.accept_invitation(p_kind, p_token, p_family_id, p_new_family_name, p_display_name) $$;
create function public.revoke_invitation(p_id uuid) returns void language sql security invoker set search_path = '' as $$ select pool_private.revoke_invitation(p_id) $$;
create function public.remove_family_member(p_family_id uuid, p_user_id uuid) returns void language sql security invoker set search_path = '' as $$ select pool_private.remove_family_member(p_family_id, p_user_id) $$;
create function public.remove_circle_family(p_circle_id uuid, p_family_id uuid) returns void language sql security invoker set search_path = '' as $$ select pool_private.remove_circle_family(p_circle_id, p_family_id) $$;
create function public.list_invitations(p_kind text, p_scope_id uuid) returns table(id uuid, email text, created_at timestamptz, expires_at timestamptz, revoked_at timestamptz, consumed_at timestamptz) language sql security invoker set search_path = '' as $$ select * from pool_private.list_invitations(p_kind, p_scope_id) $$;
create function public.circle_roster(p_circle_id uuid) returns table(family_id uuid, family_name text) language sql security invoker set search_path = '' as $$ select * from pool_private.circle_roster(p_circle_id) $$;

revoke all on all functions in schema pool_private from public, anon, authenticated;
grant execute on function pool_private.member_of(uuid), pool_private.owns_family(uuid), pool_private.in_circle(uuid), pool_private.can_read_profile(uuid) to authenticated;
grant execute on function pool_private.create_family(text,text), pool_private.create_circle(uuid,text), pool_private.create_invitation(text,uuid,text), pool_private.invitation_preview(text,text), pool_private.accept_invitation(text,text,uuid,text,text), pool_private.revoke_invitation(uuid), pool_private.remove_family_member(uuid,uuid), pool_private.remove_circle_family(uuid,uuid), pool_private.list_invitations(text,uuid), pool_private.circle_roster(uuid) to authenticated;
revoke all on function public.create_family(text,text), public.create_circle(uuid,text), public.create_invitation(text,uuid,text), public.invitation_preview(text,text), public.accept_invitation(text,text,uuid,text,text), public.revoke_invitation(uuid), public.remove_family_member(uuid,uuid), public.remove_circle_family(uuid,uuid), public.list_invitations(text,uuid), public.circle_roster(uuid) from public, anon, authenticated;
grant execute on function public.create_family(text,text), public.create_circle(uuid,text), public.create_invitation(text,uuid,text), public.invitation_preview(text,text), public.accept_invitation(text,text,uuid,text,text), public.revoke_invitation(uuid), public.remove_family_member(uuid,uuid), public.remove_circle_family(uuid,uuid), public.list_invitations(text,uuid), public.circle_roster(uuid) to authenticated;
