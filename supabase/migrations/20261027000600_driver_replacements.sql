-- R7: replacement requests reuse the R5 reply/consent/finalization authority.
-- The original assignment stays on the same ride revision during an optional swap.
-- Reuse R6's assignment_trip_key for the original assignment binding.
alter table public.driver_assignments drop constraint driver_assignments_release_reason_check;
alter table public.driver_assignments add constraint driver_assignments_release_reason_check
  check (release_reason in ('cancelled','withdrawn','consent_revoked','invalidated','completed','replaced'));
alter table public.driver_proposals add column request_order bigint generated always as identity;
alter table public.driver_proposals add column mode text not null default 'initial' check (mode in ('initial','optional_swap','unavailable'));
alter table public.driver_proposals add column original_assignment_id uuid;
alter table public.driver_proposals add column original_assignment_revision integer;
alter table public.driver_proposals add constraint replacement_origin foreign key(original_assignment_id,ride_id,original_assignment_revision)
  references public.driver_assignments(id,ride_id,ride_revision);
alter table public.driver_proposals add constraint replacement_mode check (
  (mode='initial' and original_assignment_id is null and original_assignment_revision is null) or
  (mode<>'initial' and original_assignment_id is not null and original_assignment_revision is not null));
create index proposals_request_order on public.driver_proposals(ride_id,ride_revision desc,request_order desc);

-- Every persisted event is produced inside the state transaction, never by clients.
create table public.replacement_events (
  id bigint generated always as identity primary key,
  proposal_id uuid not null references public.driver_proposals(id),
  ride_id uuid not null references public.rides(id),
  actor_id uuid not null references public.profiles(id),
  actor_name text not null check(length(btrim(actor_name)) between 1 and 80),
  kind text not null check (kind in ('requested','accepted','consented','confirmed','declined','cancelled','expired','withdrawn','consent_revoked','invalidated')),
  occurred_at timestamptz not null default clock_timestamp() check(isfinite(occurred_at))
);
create index replacement_event_history on public.replacement_events(ride_id,id);
alter table public.replacement_events enable row level security;
revoke all on public.replacement_events from public,anon,authenticated;
grant select on public.replacement_events to authenticated;
create policy replacement_history on public.replacement_events for select to authenticated using(pool_private.can_read_ride(ride_id));
create trigger immutable_replacement_event before update or delete on public.replacement_events for each row execute function pool_private.immutable_ride_event();
create function pool_private.record_replacement_event() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.driver_proposals; k text;
begin
  if tg_table_name='ride_driver_consents' then
    select * into p from public.driver_proposals where id=new.proposal_id;
    k:='consented';
  else
    p:=new;
    k:=case when tg_op='INSERT' then 'requested' when new.status<>old.status then new.status
      when old.accepted_at is null and new.accepted_at is not null then 'accepted' end;
  end if;
  if p.mode<>'initial' and k is not null then
    insert into public.replacement_events(proposal_id,ride_id,actor_id,actor_name,kind)
      select p.id,p.ride_id,pool_private.require_actor(),display_name,k from public.profiles where id=pool_private.actor();
  end if;
  return new;
end $$;
create trigger replacement_proposal_event after insert or update on public.driver_proposals for each row execute function pool_private.record_replacement_event();
create trigger replacement_consent_event after insert on public.ride_driver_consents for each row execute function pool_private.record_replacement_event();

create function pool_private.request_replacement(p_id uuid,p_ride_id uuid,p_family_id uuid,p_revision integer,p_driver_id uuid,p_driver_family_id uuid,p_vehicle_id uuid,p_vehicle_version integer,p_mode text,p_original_assignment_id uuid,p_original_assignment_revision integer,p_deadline timestamptz) returns uuid
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
  if exists(select 1 from public.ride_families where ride_id=r.id and (status='invited' or (status='joined' and not pool_private.ride_family_active(circle_id,family_id))))
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

-- Original withdrawal clears coverage and invalidates every dependent swap.
create or replace function pool_private.close_driver(p_ride uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.ride_trips where ride_id=p_ride) then raise exception 'trip_frozen' using errcode='PT423'; end if;
  update public.driver_proposals set status=case when p_reason='withdrawn' and status='pending' and mode='optional_swap' then 'invalidated' else p_reason end,
    closed_at=clock_timestamp() where ride_id=p_ride and status in ('pending','confirmed');
  update public.driver_assignments set released_at=clock_timestamp(),release_reason=p_reason where ride_id=p_ride and released_at is null;
end $$;

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
  if exists(select 1 from public.ride_trips t join public.driver_assignments active on active.id=t.assignment_id
    where t.completed_at is null and (active.driver_id=p.driver_id or active.vehicle_id=p.vehicle_id)) then raise exception 'unfinished_trip' using errcode='PT424'; end if;
  -- Release only after every consent check, in the same transaction as INSERT.
  -- Any exception (including a waiting exclusion check or deadline) restores it.
  if p.mode='optional_swap' then
    update public.driver_assignments set released_at=clock_timestamp(),release_reason='replaced' where id=original.id;
    update public.driver_proposals set status='invalidated',closed_at=clock_timestamp() where id=original.proposal_id;
  end if;
  -- The INSERT (including exclusion constraints) and the reply commit together.
  begin
    insert into public.driver_assignments(proposal_id,ride_id,ride_revision,driver_id,vehicle_id,vehicle_version,starts_at,ends_at)
      values(p.id,r.id,r.revision,p.driver_id,p.vehicle_id,p.vehicle_version,r.starts_at,r.ends_at);
  exception when exclusion_violation then raise exception 'driver_or_vehicle_reserved' using errcode='PT424';
  end;
  -- An exclusion check may itself wait for another reservation to release.
  if p.deadline<=clock_timestamp() then raise exception 'expired' using errcode='PT410'; end if;
  update public.driver_proposals set status='confirmed',closed_at=clock_timestamp() where id=p.id;
  if p.deadline<=clock_timestamp() then raise exception 'expired' using errcode='PT410'; end if;
  return 'confirmed';
end $$;

create or replace function pool_private.reply_driver(p_id uuid,p_revision integer,p_action text,p_family_id uuid,p_child_ids uuid[],p_available_seats integer,p_restraints boolean) returns text language plpgsql security definer set search_path = '' as $$
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
  if exists(select 1 from public.ride_trips where ride_id=r.id) then
    -- Keep R5's harmless confirmed acceptance/consent retries; no replacement replies after pickup.
    if p.mode<>'initial' or p_action not in ('accept','consent') then raise exception 'trip_frozen' using errcode='PT423'; end if;
  end if;
  if p.status='invalidated' and exists(select 1 from public.driver_proposals newer where newer.original_assignment_id in (select id from public.driver_assignments where proposal_id=p.id)) then raise exception 'superseded_assignment' using errcode='PT409'; end if;
  if p.mode<>'initial' then
    if p.status<>'pending' and not (p.status='confirmed' and p_action in ('withdraw','revoke')) then raise exception 'closed_proposal' using errcode='PT409'; end if;
    if p.status='pending' and p.deadline<=clock_timestamp() then raise exception 'expired' using errcode='PT410'; end if;
    if r.cancelled_at is not null or r.revision<>p_revision or p.roster<>pool_private.ride_roster(r.id) then raise exception 'stale_proposal' using errcode='PT409'; end if;
  end if;
  -- Event actor FKs and candidate finalization share the nomination profile order.
  perform 1 from public.profiles where id in (v_actor,p.driver_id) order by id for update;
  if p.mode<>'initial' and p.status='pending' and p.deadline<=clock_timestamp() then raise exception 'expired' using errcode='PT410'; end if;
  if p_action in ('withdraw','revoke','cancel') then
    if p_action='revoke' then
      if p_child_ids is null or cardinality(p_child_ids)=0 or cardinality(p_child_ids)<>(select count(distinct x) from unnest(p_child_ids) x)
        or exists(select 1 from unnest(p_child_ids) x where not exists(select 1 from public.ride_driver_consents c where c.proposal_id=p.id and c.child_id=x and c.family_id=p_family_id)) then raise exception 'invalid_own_children' using errcode='PT400'; end if;
      update public.ride_driver_consents set revoked_at=coalesce(revoked_at,clock_timestamp()) where proposal_id=p.id and child_id=any(p_child_ids) and family_id=p_family_id;
    end if;
    if p_action='cancel' and p.status='confirmed' then raise exception 'withdraw_or_revoke_first' using errcode='PT409'; end if;
    if p.status in ('pending','confirmed') then
      if p.mode<>'initial' and p.status='pending' then
        -- Closing this candidate never releases an available original assignment.
        update public.driver_proposals set status=case p_action when 'withdraw' then 'withdrawn' when 'revoke' then 'consent_revoked' else 'cancelled' end,closed_at=clock_timestamp() where id=p.id;
      else
        perform pool_private.close_driver(r.id,case p_action when 'withdraw' then 'withdrawn' when 'revoke' then 'consent_revoked' else 'cancelled' end);
        update public.rides set revision=revision+1 where id=r.id;
      end if;
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
    if p.mode='initial' then update public.rides set revision=revision+1 where id=r.id; end if;
    return 'declined';
  end if;
  return pool_private.finalize_driver(p.id);
end $$;

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
  -- Compatibility for older clients: a fresh nomination after withdrawal is
  -- still a replacement, with the same origin/fresh-response rules and pickup deadline.
  select * into prior from public.driver_assignments where ride_id=p_ride_id order by confirmed_at desc,id desc limit 1;
  update public.rides set revision=revision+1 where id=p_ride_id returning revision into p_revision;
  insert into public.driver_proposals(id,ride_id,ride_revision,nominated_by,nominating_family_id,driver_id,driver_family_id,vehicle_id,vehicle_version,roster,deadline,mode,original_assignment_id,original_assignment_revision)
    values(p_id,p_ride_id,p_revision,v_actor,p_family_id,p_driver_id,p_driver_family_id,p_vehicle_id,p_vehicle_version,pool_private.ride_roster(p_ride_id),v_ride.starts_at,
      case when prior.release_reason='withdrawn' then 'unavailable' else 'initial' end,
      case when prior.release_reason='withdrawn' then prior.id end,case when prior.release_reason='withdrawn' then prior.ride_revision end);
  if v_ride.starts_at<=clock_timestamp() then raise exception 'expired' using errcode='PT410'; end if;
  return p_id;
end $$;

-- First pickup serializes with replacement replies through the ride lock.
-- Starting with the original invalidates every still-pending swap in that transaction.
create function pool_private.close_swaps_on_pickup() returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.driver_proposals set status='invalidated',closed_at=clock_timestamp() where ride_id=new.ride_id and status='pending';
  return new;
end $$;
create trigger pickup_closes_replacements after insert on public.ride_trips for each row execute function pool_private.close_swaps_on_pickup();

create or replace function pool_private.invalidate_driver_membership() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_circle uuid; v_ride uuid; affected uuid;
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
      for affected in select p.id from public.driver_proposals p where p.ride_id=v_ride and p.status in ('pending','confirmed') and
        (case when tg_table_name='circle_families' then p.driver_family_id=new.family_id or exists(select 1 from public.ride_families rf where rf.ride_id=v_ride and rf.family_id=new.family_id and rf.status='joined')
        else (p.driver_family_id=new.family_id and p.driver_id=(to_jsonb(new)->>'user_id')::uuid) or exists(select 1 from public.ride_driver_consents c where c.proposal_id=p.id and c.family_id=new.family_id and c.guardian_id=(to_jsonb(new)->>'user_id')::uuid and c.revoked_at is null) end)
        order by case when p.status='confirmed' then 0 else 1 end loop
        if exists(select 1 from public.driver_assignments where proposal_id=affected and released_at is null) then
          perform pool_private.close_driver(v_ride,'invalidated');
          update public.rides set revision=revision+1 where id=v_ride;
        else
          update public.driver_proposals set status='invalidated',closed_at=clock_timestamp() where id=affected and status='pending';
        end if;
      end loop;
    end loop;
  end loop;
  return new;
end $$;

create function public.request_replacement(p_id uuid,p_ride_id uuid,p_family_id uuid,p_revision integer,p_driver_id uuid,p_driver_family_id uuid,p_vehicle_id uuid,p_vehicle_version integer,p_mode text,p_original_assignment_id uuid,p_original_assignment_revision integer,p_deadline timestamptz) returns uuid
language sql security invoker set search_path='' as $$ select pool_private.request_replacement(p_id,p_ride_id,p_family_id,p_revision,p_driver_id,p_driver_family_id,p_vehicle_id,p_vehicle_version,p_mode,p_original_assignment_id,p_original_assignment_revision,p_deadline) $$;
revoke all on function public.request_replacement(uuid,uuid,uuid,integer,uuid,uuid,uuid,integer,text,uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.request_replacement(uuid,uuid,uuid,integer,uuid,uuid,uuid,integer,text,uuid,integer,timestamptz) to authenticated;
revoke all on function pool_private.request_replacement(uuid,uuid,uuid,integer,uuid,uuid,uuid,integer,text,uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function pool_private.request_replacement(uuid,uuid,uuid,integer,uuid,uuid,uuid,integer,text,uuid,integer,timestamptz) to authenticated;
revoke all on function pool_private.record_replacement_event(),pool_private.close_swaps_on_pickup() from public,anon,authenticated;

drop function public.driver_status(uuid);
drop function public.driver_statuses(uuid[]);
drop function public.driver_inbox(timestamptz,uuid,integer,boolean);
drop function pool_private.driver_status(uuid[],boolean,boolean,timestamptz,uuid,integer);
create function pool_private.driver_status(p_ride_ids uuid[],p_driver_only boolean,p_pending_only boolean,p_after_start timestamptz,p_after_id uuid,p_limit integer) returns table(proposal_id uuid,ride_id uuid,ride_revision integer,driver_id uuid,driver_name text,vehicle_id uuid,vehicle_label text,vehicle_version integer,passenger_seats integer,available_seats integer,restraints_confirmed boolean,accepted_at timestamptz,deadline timestamptz,proposal_status text,coverage text,rider_count integer,booster_count integer,child_seat_count integer,consent_count integer,pickup_summary text,destination_summary text,starts_at timestamptz,ends_at timestamptz,timezone text,is_driver boolean,cancelled_at timestamptz,mode text,current_assignment_id uuid,current_assignment_revision integer,current_driver_name text,current_proposal_id uuid,current_proposal_revision integer,is_current_driver boolean,current_assignment_release_reason text) language plpgsql security definer set search_path = '' as $$
begin
  perform pool_private.require_actor();
  if p_driver_only is null or p_pending_only is null or p_limit is null or p_limit not between 1 and 1000
    or (p_ride_ids is null and not p_driver_only)
    or (p_ride_ids is not null and (cardinality(p_ride_ids)>1000 or cardinality(p_ride_ids)<>(select count(distinct x) from unnest(p_ride_ids) x)))
    or ((p_after_start is null)<>(p_after_id is null)) or (p_after_start is not null and not isfinite(p_after_start)) then raise exception 'validation' using errcode='PT400'; end if;
  return query select p.id,r.id,p.ride_revision,p.driver_id,pr.display_name,v.id,v.label,p.vehicle_version,v.passenger_seats,p.available_seats,p.restraints_confirmed,p.accepted_at,p.deadline,
    case when p.status='pending' and p.deadline<=clock_timestamp() then 'expired' else p.status end,
    case when exists(select 1 from public.ride_trips t join public.driver_assignments a on a.id=t.assignment_id where a.proposal_id=p.id and t.completed_at is not null) then 'confirmed' when exists(select 1 from public.driver_assignments a where a.ride_id=r.id and a.released_at is null) then 'confirmed'
      when p.status='pending' and p.deadline>clock_timestamp() then 'awaiting_confirmation' else 'needs_driver' end,
    jsonb_array_length(p.roster),
    (select count(*)::integer from jsonb_array_elements(p.roster) x where x->>'seat'='booster'),
    (select count(*)::integer from jsonb_array_elements(p.roster) x where x->>'seat'='child-seat'),
    (select count(*)::integer from public.ride_driver_consents c where c.proposal_id=p.id and c.revoked_at is null),
    r.pickup_summary,r.destination_summary,r.starts_at,r.ends_at,r.timezone,p.driver_id=pool_private.actor(),r.cancelled_at,p.mode,origin.id,origin.ride_revision,
    (select display_name from public.profiles where id=origin.driver_id),origin.proposal_id,origin.ride_revision,
    origin.released_at is null and origin.driver_id=pool_private.actor(),origin.release_reason
    from public.driver_proposals p join public.rides r on r.id=p.ride_id join public.vehicles v on v.id=p.vehicle_id join public.profiles pr on pr.id=p.driver_id
    left join lateral (select a.* from public.driver_assignments a where a.ride_id=r.id
      order by (a.released_at is null) desc,a.confirmed_at desc,a.id desc limit 1) origin on true
    where (p_ride_ids is null or r.id=any(p_ride_ids))
      and (not p_driver_only or p.driver_id=pool_private.actor() or (not p_pending_only and pool_private.confirmed_driver(r.id)))
      and (not p_pending_only or (p.status='pending' and p.deadline>clock_timestamp()))
      and (p_after_start is null or (r.starts_at,r.id)>(p_after_start,p_after_id)) and
      (exists(select 1 from public.ride_families rf where rf.ride_id=r.id and pool_private.participates(r.id,rf.family_id)) or
       (p.driver_id=pool_private.actor() and pool_private.driver_is_member(r.circle_id,p.driver_family_id,p.driver_id)) or pool_private.confirmed_driver(r.id))
      and p.id=(select newest.id from public.driver_proposals newest where newest.ride_id=r.id order by newest.ride_revision desc,newest.request_order desc limit 1)
    order by r.starts_at,r.id limit p_limit;
end $$;
create function public.driver_status(p_ride_id uuid) returns table(proposal_id uuid,ride_id uuid,ride_revision integer,driver_id uuid,driver_name text,vehicle_id uuid,vehicle_label text,vehicle_version integer,passenger_seats integer,available_seats integer,restraints_confirmed boolean,accepted_at timestamptz,deadline timestamptz,proposal_status text,coverage text,rider_count integer,booster_count integer,child_seat_count integer,consent_count integer,pickup_summary text,destination_summary text,starts_at timestamptz,ends_at timestamptz,timezone text,is_driver boolean,cancelled_at timestamptz,mode text,current_assignment_id uuid,current_assignment_revision integer,current_driver_name text,current_proposal_id uuid,current_proposal_revision integer,is_current_driver boolean,current_assignment_release_reason text) language sql security invoker set search_path = '' as $$ select * from pool_private.driver_status(array[p_ride_id],false,false,null,null,1) $$;
revoke all on function public.driver_status(uuid) from public,anon,authenticated;
grant execute on function public.driver_status(uuid) to authenticated;
create function public.driver_statuses(p_ride_ids uuid[]) returns table(proposal_id uuid,ride_id uuid,ride_revision integer,driver_id uuid,driver_name text,vehicle_id uuid,vehicle_label text,vehicle_version integer,passenger_seats integer,available_seats integer,restraints_confirmed boolean,accepted_at timestamptz,deadline timestamptz,proposal_status text,coverage text,rider_count integer,booster_count integer,child_seat_count integer,consent_count integer,pickup_summary text,destination_summary text,starts_at timestamptz,ends_at timestamptz,timezone text,is_driver boolean,cancelled_at timestamptz,mode text,current_assignment_id uuid,current_assignment_revision integer,current_driver_name text,current_proposal_id uuid,current_proposal_revision integer,is_current_driver boolean,current_assignment_release_reason text) language sql security invoker set search_path = '' as $$ select * from pool_private.driver_status(p_ride_ids,false,false,null,null,1000) $$;
revoke all on function public.driver_statuses(uuid[]) from public,anon,authenticated;
grant execute on function public.driver_statuses(uuid[]) to authenticated;
create function public.driver_inbox(p_after_start timestamptz default null,p_after_id uuid default null,p_limit integer default 26,p_pending_only boolean default false) returns table(proposal_id uuid,ride_id uuid,ride_revision integer,driver_id uuid,driver_name text,vehicle_id uuid,vehicle_label text,vehicle_version integer,passenger_seats integer,available_seats integer,restraints_confirmed boolean,accepted_at timestamptz,deadline timestamptz,proposal_status text,coverage text,rider_count integer,booster_count integer,child_seat_count integer,consent_count integer,pickup_summary text,destination_summary text,starts_at timestamptz,ends_at timestamptz,timezone text,is_driver boolean,cancelled_at timestamptz,mode text,current_assignment_id uuid,current_assignment_revision integer,current_driver_name text,current_proposal_id uuid,current_proposal_revision integer,is_current_driver boolean,current_assignment_release_reason text) language sql security invoker set search_path = '' as $$ select * from pool_private.driver_status(null,true,p_pending_only,p_after_start,p_after_id,p_limit) $$;
revoke all on function public.driver_inbox(timestamptz,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.driver_inbox(timestamptz,uuid,integer,boolean) to authenticated;
revoke all on function pool_private.driver_status(uuid[],boolean,boolean,timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function pool_private.driver_status(uuid[],boolean,boolean,timestamptz,uuid,integer) to authenticated;
