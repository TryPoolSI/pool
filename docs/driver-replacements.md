# Driver replacements (R7)

R7 is stacked on [R6 #8](https://github.com/UWorldJK/pool/pull/8),
`lkluge/ride-handoffs` at `04a39f0`. Its ancestry includes R1 through R6.
The PR targets R6 so the review diff contains only R7. Retarget and revalidate
as predecessors merge. Parent branches and inherited migrations stay unchanged.
Production release still requires validated, reviewed, PR-merged current main
and the inherited test-delivery and production environment gates.

## Request and review

On a joined ride, a guardian manually chooses a circle adult and their registered
vehicle and submits a future review deadline, explicitly in UTC and no later than
scheduled pickup. No matching or live availability is inferred. Participants must
open the ride and reply themselves; the application does not deliver notifications.

An **optional swap** leaves the available current driver and reservation in place.
The candidate separately accepts driving, seats and required restraints. Guardians
approve only their own enrolled children, with one saved consent per child.
Cancellation, candidate decline, revoked candidate consent or effective expiry
preserves the available original assignment. The current driver can still report
pickup; first pickup invalidates the pending swap and freezes R6 responsibilities.

When the current driver **withdraws as unavailable**, the assignment and reservation
are cleared immediately and every pending swap is closed. A new unavailable-driver
request has a new proposal identity and no inherited acceptance or child consent.
Partial, missing or duplicate replies do not cover the ride. Decline, cancellation
and expiry leave it uncovered. A guardian cannot accept on a candidate's behalf,
and circle coordination grants no consent authority.

The review panel shows the mode, current driver, candidate, deadline, actual driver
acceptance, child consent totals and outstanding responses. Family actions list
only that family's children. Needs attention includes pending replacement replies
even when an available original still covers the ride. Reload to see saved changes;
expiry is calculated on reads with database time, without a background scheduler.
History records actual actors and database times under current ride-read authority,
with bounded pages and a stable event cursor.
Proposed-only drivers retain the restricted R5 projection and do not acquire private
children, addresses, consent rows or event history merely by being nominated.

## Transaction and authority

The forward migration extends the existing `driver_proposals` with mode, the exact
original assignment/revision, and a monotonic request order. Replacement requests
freeze the same ride revision as the original during optional review; this preserves
R6's original assignment and first-pickup validation. Request identity orders
multiple attempts within that unchanged plan revision. Existing proposal selection
continues to prioritize ride revision, including upgraded historical rows.

The original assignment binding has a composite foreign key. Existing unique
pending-proposal and active-assignment indexes, consent composite keys, vehicle
ownership/version constraints and driver/vehicle interval exclusion constraints
remain authoritative. No application table writes are granted. Public invoker
commands use the same authenticated private reply, child-consent and finalization
functions with fixed search paths. Actor IDs, acceptance, counts and timestamps
never come from submitted forms. Older clients using initial nomination after
withdrawal also create a bound unavailable replacement, with pickup as its stored
review deadline; that entry point cannot omit the origin or reuse prior replies.
A previously unavailable adult may be nominated again only through a fresh request
and their actual renewed acceptance, with fresh consent for every child. New history has RLS and an immutable event trigger.

Requests and replies acquire ordered family roots, circle and ride locks shared
with R4/R5/R6 membership, cancellation and pickup commands. The final reply rechecks
live memberships, roster/revision, every child's valid consent, vehicle owner/version,
capacity, restraint attestation, original assignment, database deadline and driver/
vehicle conflicts, including unfinished trips. Only then does it release an available
original reservation and insert the replacement assignment in the same transaction.
Failure, including an exclusion wait that crosses the deadline or an event-write
failure, rolls back the reply and restores the original reservation.

Candidate-only membership removal invalidates the request without releasing an
unaffected original. Removal affecting the original assignment retains inherited
coverage invalidation; R6 protects active responsibility until every handoff is
complete. Plan/roster/vehicle dependency guards reject changes while replies or
assignments are live. After closure, permitted changes require fresh proposals;
reply checks never carry old approvals into a changed plan or vehicle. Closed,
expired, superseded and finalized replacement responses cannot reopen a request.
Completed coverage follows the actual trip assignment even when a failed swap is
still the latest proposal. Completed-driver identity is separate from an active
reservation, retaining R6's authorized history reads and detail screen after the
final receipt releases the reservation. Forward migrations preserve existing R7
trips and immutable events while correcting these projections.
First pickup and replacement finalization serialize on the ride; after any pickup,
replacement requests/replies and ordinary withdrawal/cancellation are unavailable.

## Validation and limits

`npm run test:auth` owns a disposable Supabase project, tests R2 through R6 data
upgrades into R7, compares clean/upgrade generated public types and runs inherited
permissions, migration-executor checks and Chromium journeys. R7 adds authenticated
replacement command tests for optional preservation, unavailable outcomes, fresh
acceptance/consent, duplicate/partial/foreign replies, competing requests, direct
writes, stale/late responses, capacity/version/reservation failures, atomic rollback
and withdrawal/cancellation/pickup/deadline races. Browser accounts exercise real
nomination, acceptance and own-family consent, command RPC replay denials, mobile
reflow and persisted outcomes through an independent login session.

Hosted provider projects, credentials, protected environments, SMTP/origins and
hosted acceptance remain pending as documented in deployment/authentication docs.
Local CI and a skipped Supabase Preview integration do not establish hosted delivery.
No production or hosted deployment is included. No automatic matching, live
availability, active-trip replacements, GPS, notifications, calendar, native work,
visual parity or expiry scheduler is included. Stop for user review; do not merge
or start R8.
