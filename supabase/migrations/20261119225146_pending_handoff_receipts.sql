create index handoffs_awaiting_recipient on public.ride_handoffs (recipient_id, ride_id)
where status = 'awaiting_handoff';

create function public.pending_handoff_receipts() returns table (ride_id uuid)
language sql stable security invoker set search_path = '' as $$
  select distinct handoff.ride_id
  from public.ride_handoffs handoff
  join public.ride_trips trip on trip.ride_id = handoff.ride_id
  join public.rides ride on ride.id = handoff.ride_id
  where handoff.status = 'awaiting_handoff'
    and handoff.recipient_id = (select auth.uid())
    and ride.cancelled_at is null
    and trip.completed_at is null
    and pool_private.participates(handoff.ride_id, handoff.family_id)
  order by handoff.ride_id
$$;

revoke all on function public.pending_handoff_receipts() from public, anon, authenticated;
grant execute on function public.pending_handoff_receipts() to authenticated;
