# Driver confirmation (R5 / M1)

R5 is stacked on [R4 #6](https://github.com/UWorldJK/pool/pull/6), branch
`lkluge/ride-planning` at `5f83da1`. That parent includes R1, R2 and R3.
Review R5 against R4; retarget and revalidate as predecessors merge. CI includes
this stacked base. Production delivery still requires validated, protected,
PR-merged current `main`, successful test delivery and the inherited release gates.

## Use the scheduling and assignment workflow

1. Independent adults confirm their email, sign in, create families, register
   children and explicitly join a circle through the R2/R3 screens.
2. A guardian plans a ride and invites other circle families. Each family joins
   with its own children or declines. Every included family must respond before
   nomination. A declined family supplies no riders.
3. An eligible circle adult registers their own vehicle at `/app/vehicles`.
   Passenger seats exclude the driver. Vehicle labels should contain only a
   useful description, not license plates or personal information.
4. A participating guardian nominates a circle adult, including themselves, and
   one of that adult's registered vehicles on the ride detail screen. This
   freezes the ride revision, child/family/seat roster, driver membership context
   and vehicle version. There is at most one pending proposal and no optional
   replacement while an assignment is active. The reply deadline is pickup time.
5. The driver replies from `/app/driving`, Needs attention or the ride detail.
   They explicitly confirm available passenger seats and accommodation of all
   required boosters/child seats. This is a driver attestation. It is not an
   independent restraint inspection.
6. Guardians separately consent for their own enrolled children on the detail
   screen. One action can cover multiple own children. Even a self-nominated
   driver must perform driver acceptance and child consent as separate actions.
   Family/circle membership or invitation acceptance never supplies ride consent.
7. The last necessary reply confirms one assignment only when every transactional
   check succeeds. Refresh other sessions/devices to see the same saved plan.
   The schedule distinguishes needs-driver, awaiting-confirmation and confirmed.
   Cancellation is separate. A past pickup never implies trip completion.

Declining, cancelling a proposal or letting it expire leaves the ride unassigned.
Any participating guardian may cancel a pending nomination; only the driver may
decline/withdraw driving. The driver can withdraw an accepted pending proposal
or a confirmed assignment. A current guardian can revoke their own family's child
consent, including consent given by another guardian of that same family. This
closes the proposal, releases the assignment and leaves an explicit need for a
driver. A new nomination requires fresh acceptance and consent; retries of closed
proposals cannot reopen them. Whole-ride cancellation remains restricted to the
original creating adult in their original current family/circle context and is
atomic with proposal closure and reservation release.

Cancel the pending proposal or withdraw/revoke a confirmed assignment before
changing enrollment or the selected vehicle. Saving the roster and nominating
again creates new revisions; old consent never carries forward. M1 has no general
route/time editing: cancel/recreate a changed trip. Retire a vehicle instead of
removing its history. Updates/retirement of a dependent vehicle are rejected.
Removed participating families cannot be edited by other guardians; resolve their
membership and enrollment explicitly, or cancel/recreate the ride.

## Database authority and privacy

`20261027000300_driver_confirmation.sql` is additive after the unchanged R3/R4
migrations. The four new tables have RLS, explicit authenticated SELECT policies
and no application table-write grants. Public invoker wrappers call checked
private definer routines with fixed empty search paths. Shared commands
continue to authenticate via Auth and use public keys with user sessions; no
privileged session client or alternate API was added.

| Data | Visibility |
| --- | --- |
| Vehicles table | Driver's own vehicles only |
| Nomination options RPC | Participating guardians; current circle adult display name, membership context, registered vehicle label/version/capacity only |
| Proposed-driver projection | Nominated adult in their current recorded circle/family membership; coarse route, interval/timezone, rider/seat/restraint counts, reply deadline, driver/vehicle and reply totals; no child IDs/names, exact locations, emails or unrelated profiles |
| Exact trip locations and ride-specific rider snapshots | Current participating guardians and current confirmed driver |
| Base child records | Own family's current guardians only, even after confirmation |
| Child consent rows | Own participating family's current guardians only |
| Full proposal rows | Current participating guardians only |
| Assignment rows | Current participating guardians; confirmed driver can read their own active assignment |
| Unrelated/removed account | No ride/proposal/assignment access by guessed IDs or stale session claims |

Consents and assignments have composite foreign keys binding proposal, ride,
revision, driver, vehicle and vehicle version. Consent additionally records the
child, family, authenticated guardian and database timestamp, unique per proposal
and child. The proposal's immutable roster holds the enrollment seat snapshot.
Replies compare the expected revision. Nomination uses a stable request UUID;
identical duplicate creates return the existing ID and cannot revive closure.
Duplicate replies cannot create extra consents or assignments.

Commands lock all affected family roots in UUID order, then circle and ride,
sharing R3's membership-removal order. Nomination locks nominator/driver profiles in UUID order before the vehicle,
including self nomination. Finalization serializes on the driver profile and vehicle and repeats current driver/family/guardian membership, fixed
roster/revision, all child consents, vehicle owner/version/seats, explicit restraint
attestation and database-time deadline checks after waiting. Partial unique
indexes allow one pending proposal and one active assignment per ride. PostgreSQL
GiST exclusion constraints independently prohibit overlapping active driver or
vehicle reservations, using half-open intervals so adjacent rides are allowed.
A conflicting last reply rolls back with a useful error; resolve the competing
reservation and explicitly retry. There is no client-side count-then-insert.

Triggers protect inherited roster/location/plan mutation entry points. Whole-ride
cancellation closes proposals and releases reservations inside the same database
transaction. Before pickup, necessary guardian, driver or circle-family removal closes affected
future assignments and bumps the ride revision in the removal transaction.
Subsequent reads use current memberships. No replacement is selected. Expired
pending proposals have an effective needs-driver status using database time on
reads; every reply checks the deadline, and a new nomination closes expired
history. Correctness requires no background scheduler.

Schedule and family attention coverage request statuses for the exact displayed
ride IDs (at most the Data API's 1,000-row offer limit), so unrelated history cannot
hide a confirmed assignment. The driving inbox filters the driver's role and
optional pending state in the database before keyset pagination by pickup instant
and ride UUID. Pages contain 25 entries with a next-page cursor; pending attention
shows 25 requests and links to the paginated pending inbox for additional requests.

## Validation and delivery status

`npm run test:auth` owns a disposable local backend, retains identities/data across
R2 → R3 → R4 → R5 upgrades, compares generated public types with a clean reset,
and runs real public-key/session Data API/RPC permissions plus independent-account
Chromium journeys. It never resets the developer's existing backend. Use
`npm run db:types` to regenerate types and `npm run test:db` for database-only
checks. Actual assertions use normal sessions; privileged credentials are confined
to disposable fixture creation and deliberate corruption/lock scenarios.

R5 adds `scripts/driver-permissions.mjs`, driver command-service regressions and
`tests/auth/drivers.spec.mjs`. These cover full M1 consent/acceptance and reload,
authority/privacy denials, child-specific missing consent, self nomination,
insufficient/invalid seats, missing restraint acknowledgment, expired and delayed
replies, stale revisions/vehicles, direct writes, competing confirmations,
overlap/adjacency, cancellation, withdrawal and consent/membership invalidation.
Inherited lint/types/regressions, Auth/membership/planning browsers, migration
executor and container checks remain required.

**Hosted M1 is not verified.** This change provisions no accounts, projects,
credentials, provider settings or paid services. The existing pending owner setup
in [deployment.md](deployment.md) and [authentication.md](authentication.md) still
blocks an isolated hosted migration, real SMTP/canonical-origin Auth run, and
independent-account M1 acceptance on that hosted app. Local tests and a skipped
Supabase Preview integration are not hosted verification. Production remains
restricted to validated, reviewed and merged `main`; stacked PRs do not authorize
release. Before a real-family pilot, resolve the roadmap's retention/contact and
account-removal policy decisions.

No replacement swaps, trip events/pickup/arrival/handoff, trust lists, automatic
matching, GPS, notifications, calendar integration, native work or visual parity
are included. Stop after review; do not merge or start R6.

R6 extends these rules with [pickup and handoff guards](ride-handoffs.md): first
pickup freezes the plan, withdrawal/revocation/cancellation then fail, responsible
memberships remain until actual trip completion, and completed history is retained.
The final explicit child receipt releases the assignment reservation.

R7 extends this model with [optional and unavailable-driver replacements](driver-replacements.md).
Replacement review reuses these acceptance, consent and assignment commands;
an available original stays assigned until the atomic replacement commits.
