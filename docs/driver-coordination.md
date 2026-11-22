# Driver coordination (current rules)

`20261121230000_simpler_driver_coordination.sql` replaces the approval rules
described in [driver-confirmation.md](driver-confirmation.md) and
[driver-replacements.md](driver-replacements.md). Where those documents say a
family must consent to a driver, or that every invited family must answer
first, this document is the current behaviour. Everything they say about
authorization, privacy, locking, deadlines, idempotent retries, overlap
exclusion and membership removal still holds.

## What needs a yes, and what is announced

| Decision | Whose it is | How |
| --- | --- | --- |
| A family's children ride | That family's guardian | Join the ride with their own children |
| An adult drives | That adult | "I’ll drive", or "Yes, I’ll drive" when asked |
| A child was received | The guardian named to meet the child | "I have Leo" |

Everything else changes the ride at once and is shown to the families on it:

- who is driving, and in which car;
- a change of driver, or the driver switching cars;
- a family joining, leaving or changing riders after a driver is set.

No family approves another family's decision, and a ride never waits for a
family that has not answered.

## Rules the database enforces

- **An unanswered invitation blocks nothing.** It supplies no riders. A driver
  can be asked, can offer, can be replaced and can start the trip while some
  families are still `invited`. A ride still needs at least one rider, and a
  joined family that has left the circle still blocks until it is resolved.
- **The driver's yes confirms.** Accepting a request (or offering) creates the
  assignment in the same transaction. Consent rows are no longer required to
  confirm a driver or to record the first pickup. The consent and revoke
  commands still exist for older clients; the app does not call them, and
  `pending_family_consents()` returns nothing.
- **A swap needs only the new driver's yes.** The current driver keeps the ride
  until then; the accept releases them as `replaced`. A driver changing to
  another of their own cars is one request plus their own accept.
- **Riders can change until the first pickup.** With a driver asked or set:
  - the change fits the car: the request or assignment stays, its roster
    snapshot is updated in place, and the ride revision does not move
    (assignments, trips and replies are bound to it);
  - a confirmed driver's car has no seat for the new riders: the change is
    refused with `car_full` (PT422) and nothing changes;
  - only a pending request no longer fits: that request is closed as
    `invalidated` and the ride goes back to needing a driver;
  - the last rider leaves: the driver is released as `invalidated`.
  Editing riders keeps each remaining child's receiving guardian.
- **A family still deciding can see the driver.** `driver_status` is readable
  by families whose reply is `invited`, so joining is an informed yes.
- **A family that objects leaves.** Taking its own children off the ride is the
  exit; it does not remove the driver for everyone else.

Unchanged: one pending request and one active assignment per ride, seat and
restraint checks on acceptance, a receiving guardian for every child before the
first pickup, per-child pickup, arrival and receipt, and the freeze after the
first pickup.

## Telling families

`ride_updates(p_since, p_limit)` returns what changed on the caller's upcoming
rides: `driver_set`, `driver_changed`, `car_changed`, `driver_left`, `family_joined`,
`family_left`. `car_changed` is the same driver in a different car. The two
family rows go only to the confirmed driver, who needs to know who is in the
car; a family that declines its invitation is not reported. It names only
people and families already on the ride, never
returns the caller's own actions, and is limited to rides the caller's family
has joined or the caller is confirmed to drive. Home shows the last three days
under "What changed". There are still no push notifications or emails about
rides; open screens refresh every 20 seconds.

## Known trade-offs

- A booster or child seat added by a late-joining family is shown to the
  driver ("bring 1 booster") but is not re-confirmed by them.
- Requests that were accepted but still waiting for consents when the
  migration ran stay pending until the next reply on them; any reply now
  confirms them.
- Pickup can still be recorded before the scheduled time; nothing in this
  change adds a time check.
