# Engineering Manager: sitewide-home-patterns
1. `presentation.tsx`: drop `eyebrow`; drawn icons for StatusBadge, RouteSummary and EmptyState.
2. Remove eyebrow callers and kickers (attention, rides/[id] ×3, driver-panel label restyle). Remove the `eyebrow` class.
3. `ride-list.tsx`: `rideTimeShort` for pickup and drop-off.
4. Today/Schedule: un-nest RideList (plain regions).
5. `CommandForm` `secondary` + `Button` override. Ride detail guardian forms use it.
6. Verify (check, runtime sweep, visual). State files, commit, push.
