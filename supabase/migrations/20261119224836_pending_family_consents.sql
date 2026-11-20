create function public.pending_family_consents() returns table (ride_id uuid)
language sql stable security invoker set search_path = '' as $$
  select proposal.ride_id
  from public.driver_proposals proposal
  join public.rides ride on ride.id = proposal.ride_id
  where proposal.status = 'pending'
    and proposal.deadline > now()
    and proposal.ride_revision = ride.revision
    and ride.cancelled_at is null
    and not exists (
      select 1 from public.ride_trips trip where trip.ride_id = ride.id
    )
    and exists (
      select 1
      from public.ride_riders rider
      where rider.ride_id = ride.id
        and pool_private.participates(ride.id, rider.family_id)
        and not exists (
          select 1 from public.ride_driver_consents consent
          where consent.proposal_id = proposal.id
            and consent.child_id = rider.child_id
            and consent.revoked_at is null
        )
    )
  order by proposal.ride_id
$$;

revoke all on function public.pending_family_consents() from public, anon, authenticated;
grant execute on function public.pending_family_consents() to authenticated;
