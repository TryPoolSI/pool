-- R6 review correction: bind every successfully acknowledged UUID, including
-- duplicate no-op reports, while retaining one canonical event per child/stage.
alter table public.ride_events add constraint event_request_payload unique(request_id,ride_id,child_id,kind,previous_version,actor_id);
create table public.ride_event_requests (
  request_id uuid primary key,
  event_id uuid not null,
  ride_id uuid not null,
  child_id uuid not null,
  kind text not null check(kind in ('picked_up','awaiting_handoff','completed')),
  previous_version integer not null check(previous_version>0),
  actor_id uuid not null,
  acknowledged_at timestamptz not null default clock_timestamp() check(isfinite(acknowledged_at)),
  foreign key(event_id,ride_id,child_id,kind,previous_version,actor_id)
    references public.ride_events(request_id,ride_id,child_id,kind,previous_version,actor_id)
);
create index event_requests_event on public.ride_event_requests(event_id);
insert into public.ride_event_requests(request_id,event_id,ride_id,child_id,kind,previous_version,actor_id,acknowledged_at)
  select request_id,request_id,ride_id,child_id,kind,previous_version,actor_id,occurred_at from public.ride_events;
alter table public.ride_event_requests enable row level security;
-- Command-internal deduplication metadata, not another history feed or write API.
revoke all on public.ride_event_requests from public,anon,authenticated;
create trigger immutable_event_request before update or delete on public.ride_event_requests for each row execute function pool_private.immutable_ride_event();

create function pool_private.bind_ride_event_request(p_request_id uuid,p_event public.ride_events) returns void
language plpgsql security definer set search_path='' as $$
declare existing public.ride_event_requests;
begin
  insert into public.ride_event_requests(request_id,event_id,ride_id,child_id,kind,previous_version,actor_id)
    values(p_request_id,p_event.request_id,p_event.ride_id,p_event.child_id,p_event.kind,p_event.previous_version,p_event.actor_id)
    on conflict(request_id) do nothing;
  -- ON CONFLICT waits for an in-flight UUID binding from another ride. This
  -- subsequent statement sees it and rejects mismatches, rolling back any new
  -- event/progress in the caller's transaction. Existing bindings never mutate.
  select * into existing from public.ride_event_requests where request_id=p_request_id;
  if existing.event_id<>p_event.request_id then raise exception 'request_reused' using errcode='PT409'; end if;
end $$;
revoke all on function pool_private.bind_ride_event_request(uuid,public.ride_events) from public,anon,authenticated;

create or replace function pool_private.transition_child(p_request_id uuid,p_ride_id uuid,p_child_id uuid,p_revision integer,p_version integer,p_kind text) returns text
language plpgsql security definer set search_path='' as $$
declare actor uuid:=pool_private.require_actor(); r public.rides; h public.ride_handoffs; e public.ride_events; request public.ride_event_requests; t timestamptz; prior text;
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
  select * into request from public.ride_event_requests where request_id=p_request_id;
  if found and (request.ride_id<>r.id or request.child_id<>h.child_id or request.kind<>p_kind or request.actor_id<>actor or request.previous_version<>p_version)
    then raise exception 'request_reused' using errcode='PT409'; end if;
  select * into e from public.ride_events where ride_id=r.id and child_id=h.child_id and kind=p_kind;
  if found then
    if e.actor_id=actor and e.previous_version=p_version then
      perform pool_private.bind_ride_event_request(p_request_id,e);
      return h.status;
    end if;
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
    select p_request_id,r.id,h.child_id,p_kind,h.version,actor,display_name,t from public.profiles where id=actor returning * into e;
  perform pool_private.bind_ride_event_request(p_request_id,e);
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
