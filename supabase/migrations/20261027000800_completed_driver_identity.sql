-- Keep completed-trip identity separate from an active reservation.
-- R6's existing current-membership/read rules continue to authorize the projection.
drop function public.driver_status(uuid);
drop function public.driver_statuses(uuid[]);
drop function public.driver_inbox(timestamptz,uuid,integer,boolean);
drop function pool_private.driver_status(uuid[],boolean,boolean,timestamptz,uuid,integer);
create function pool_private.driver_status(p_ride_ids uuid[],p_driver_only boolean,p_pending_only boolean,p_after_start timestamptz,p_after_id uuid,p_limit integer) returns table(proposal_id uuid,ride_id uuid,ride_revision integer,driver_id uuid,driver_name text,vehicle_id uuid,vehicle_label text,vehicle_version integer,passenger_seats integer,available_seats integer,restraints_confirmed boolean,accepted_at timestamptz,deadline timestamptz,proposal_status text,coverage text,rider_count integer,booster_count integer,child_seat_count integer,consent_count integer,pickup_summary text,destination_summary text,starts_at timestamptz,ends_at timestamptz,timezone text,is_driver boolean,cancelled_at timestamptz,mode text,current_assignment_id uuid,current_assignment_revision integer,current_driver_name text,current_proposal_id uuid,current_proposal_revision integer,is_current_driver boolean,current_assignment_release_reason text,is_completed_driver boolean) language plpgsql security definer set search_path = '' as $$
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
      (exists(select 1 from public.ride_families rf where rf.ride_id=r.id and pool_private.participates(r.id,rf.family_id)) or
       (p.driver_id=pool_private.actor() and pool_private.driver_is_member(r.circle_id,p.driver_family_id,p.driver_id)) or pool_private.confirmed_driver(r.id))
      and p.id=(select newest.id from public.driver_proposals newest where newest.ride_id=r.id order by newest.ride_revision desc,newest.request_order desc limit 1)
    order by r.starts_at,r.id limit p_limit;
end $$;
create function public.driver_status(p_ride_id uuid) returns table(proposal_id uuid,ride_id uuid,ride_revision integer,driver_id uuid,driver_name text,vehicle_id uuid,vehicle_label text,vehicle_version integer,passenger_seats integer,available_seats integer,restraints_confirmed boolean,accepted_at timestamptz,deadline timestamptz,proposal_status text,coverage text,rider_count integer,booster_count integer,child_seat_count integer,consent_count integer,pickup_summary text,destination_summary text,starts_at timestamptz,ends_at timestamptz,timezone text,is_driver boolean,cancelled_at timestamptz,mode text,current_assignment_id uuid,current_assignment_revision integer,current_driver_name text,current_proposal_id uuid,current_proposal_revision integer,is_current_driver boolean,current_assignment_release_reason text,is_completed_driver boolean) language sql security invoker set search_path = '' as $$ select * from pool_private.driver_status(array[p_ride_id],false,false,null,null,1) $$;
revoke all on function public.driver_status(uuid) from public,anon,authenticated;
grant execute on function public.driver_status(uuid) to authenticated;
create function public.driver_statuses(p_ride_ids uuid[]) returns table(proposal_id uuid,ride_id uuid,ride_revision integer,driver_id uuid,driver_name text,vehicle_id uuid,vehicle_label text,vehicle_version integer,passenger_seats integer,available_seats integer,restraints_confirmed boolean,accepted_at timestamptz,deadline timestamptz,proposal_status text,coverage text,rider_count integer,booster_count integer,child_seat_count integer,consent_count integer,pickup_summary text,destination_summary text,starts_at timestamptz,ends_at timestamptz,timezone text,is_driver boolean,cancelled_at timestamptz,mode text,current_assignment_id uuid,current_assignment_revision integer,current_driver_name text,current_proposal_id uuid,current_proposal_revision integer,is_current_driver boolean,current_assignment_release_reason text,is_completed_driver boolean) language sql security invoker set search_path = '' as $$ select * from pool_private.driver_status(p_ride_ids,false,false,null,null,1000) $$;
revoke all on function public.driver_statuses(uuid[]) from public,anon,authenticated;
grant execute on function public.driver_statuses(uuid[]) to authenticated;
create function public.driver_inbox(p_after_start timestamptz default null,p_after_id uuid default null,p_limit integer default 26,p_pending_only boolean default false) returns table(proposal_id uuid,ride_id uuid,ride_revision integer,driver_id uuid,driver_name text,vehicle_id uuid,vehicle_label text,vehicle_version integer,passenger_seats integer,available_seats integer,restraints_confirmed boolean,accepted_at timestamptz,deadline timestamptz,proposal_status text,coverage text,rider_count integer,booster_count integer,child_seat_count integer,consent_count integer,pickup_summary text,destination_summary text,starts_at timestamptz,ends_at timestamptz,timezone text,is_driver boolean,cancelled_at timestamptz,mode text,current_assignment_id uuid,current_assignment_revision integer,current_driver_name text,current_proposal_id uuid,current_proposal_revision integer,is_current_driver boolean,current_assignment_release_reason text,is_completed_driver boolean) language sql security invoker set search_path = '' as $$ select * from pool_private.driver_status(null,true,p_pending_only,p_after_start,p_after_id,p_limit) $$;
revoke all on function public.driver_inbox(timestamptz,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.driver_inbox(timestamptz,uuid,integer,boolean) to authenticated;
revoke all on function pool_private.driver_status(uuid[],boolean,boolean,timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function pool_private.driver_status(uuid[],boolean,boolean,timestamptz,uuid,integer) to authenticated;
