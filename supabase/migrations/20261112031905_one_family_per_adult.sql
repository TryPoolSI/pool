-- The index build rejects legacy duplicates and serializes competing active writes.
create unique index family_members_one_active_per_user on public.family_members (user_id) where removed_at is null;

create or replace function pool_private.create_family(p_name text, p_display_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := pool_private.require_actor(); v_id uuid; v_constraint text;
begin
  if p_name is null or length(btrim(p_name)) not between 1 and 80 or p_display_name is null or length(btrim(p_display_name)) not between 1 and 80 then
    raise exception 'validation' using errcode = 'PT400'; end if;
  insert into public.profiles(id, display_name) values (v_actor, btrim(p_display_name)) on conflict (id) do nothing;
  insert into public.families(name) values (btrim(p_name)) returning id into v_id;
  begin
    insert into public.family_members(family_id, user_id, role) values (v_id, v_actor, 'owner');
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'family_members_one_active_per_user' then
      raise exception 'active_family_exists' using errcode = 'PT409';
    end if;
    raise;
  end;
  return v_id;
end $$;

create or replace function pool_private.accept_invitation(p_kind text, p_token text, p_family_id uuid, p_new_family_name text, p_display_name text) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := pool_private.require_actor(); v_inv public.invitations; v_email text; v_family uuid := p_family_id; v_constraint text;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'unavailable' using errcode = 'PT404'; end if;
  -- Read context without locking, then use one consistent order: receiving family,
  -- scope root, invitation. Re-read the invitation after waiting for the locks.
  select * into v_inv from public.invitations where token_digest = extensions.digest(p_token, 'sha256') and kind = p_kind;
  if not found then raise exception 'unavailable' using errcode = 'PT404'; end if;
  if p_kind = 'circle' then
    if (p_family_id is null) = (p_new_family_name is null) then raise exception 'validation' using errcode = 'PT400'; end if;
    if p_family_id is not null then
      perform 1 from public.families where id = v_family for update;
      if not pool_private.owns_family(v_family) then raise exception 'not_found' using errcode = 'PT404'; end if;
    end if;
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
  if p_kind = 'guardian' then
    insert into public.profiles(id, display_name) values (v_actor, btrim(p_display_name)) on conflict(id) do nothing;
    if exists(select 1 from public.family_members where family_id = v_family and user_id = v_actor and removed_at is null) then raise exception 'already_member' using errcode = 'PT409'; end if;
    begin
      insert into public.family_members(family_id, user_id, role) values (v_family, v_actor, 'guardian')
        on conflict(family_id, user_id) do update set role = 'guardian', joined_at = now(), removed_at = null;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'family_members_one_active_per_user' then
        raise exception 'active_family_exists' using errcode = 'PT409';
      end if;
      raise;
    end;
  else
    -- A new family is private to this transaction until the invitation commits.
    if v_family is null then v_family := pool_private.create_family(p_new_family_name, p_display_name); end if;
    if exists(select 1 from public.circle_families where circle_id = v_inv.circle_id and family_id = v_family and removed_at is null) then raise exception 'already_member' using errcode = 'PT409'; end if;
    insert into public.circle_families(circle_id, family_id) values (v_inv.circle_id, v_family)
      on conflict(circle_id, family_id) do update set joined_at = now(), removed_at = null;
  end if;
  update public.invitations set consumed_at = clock_timestamp(), consumed_by = v_actor, accepted_family_id = v_family where id = v_inv.id;
  return v_family;
end $$;
