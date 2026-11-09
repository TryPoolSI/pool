# Pickup, arrival and guardian receipt (R6)

R6 is stacked on [R5 #7](https://github.com/UWorldJK/pool/pull/7),
`lkluge/driver-confirmation` at `1795aff`. Fetched remote heads and Git ancestry
confirm that parent includes R1 through R5. Review this PR against R5, then
retarget and revalidate as predecessors merge. Stacking does not authorize a
production release: validated, protected, reviewed and PR-merged current `main`
and the inherited test/production delivery gates remain mandatory.

## Recipient decision and ordinary workflow

The user approved allowing the same adult to drive and receive **only when that
adult is also the child's designated active guardian**. Driver status, circle
coordination, family ownership and ordinary guardian membership do not confer
receipt authority. Driver arrival and guardian receipt are separate explicit
commands, including for a guardian acting in both roles. External recipients are
not supported.

1. Each enrolled child's current family guardian selects one active, verified
   guardian of that same family on the ride detail screen. The choice is saved
   separately from driver consent, with an expected plan revision and recipient
   version. A guardian can designate themselves. Recipients can be changed only
   before the first pickup. No default or automatic recipient is inferred.
2. The confirmed driver explicitly reports pickup per child. The first pickup
   revalidates the confirmed assignment/revision, frozen roster, current driver
   and participating-family memberships, every required consent and its current
   guardian, vehicle ownership/version/capacity, driver acceptance/restraint
   attestation and every child's valid designated recipient. All checks and
   freezing commit with that first child's pickup/event. Invalid conditions leave
   no started trip or event. Missing children must be removed/replanned before
   pickup; no-show handling is separate work.
3. The confirmed driver explicitly reports arrival for each picked-up child.
   This saves `awaiting_handoff`. Reloading, navigating away, opening or closing
   a form, and the passage of time do not confirm receipt.
4. Only that child's designated current guardian explicitly confirms actual
   receipt. That child becomes `completed`; all other children retain their own
   states. Only the final child's receipt completes the ride and releases the
   driver/vehicle reservation. Completion does not use scheduled times or location.

Screens label this **manually reported** progress. Reports are statements by the
named adults, not live tracking, automatic arrival detection or a safety guarantee.
Refresh other sessions for current persisted data. Trip completion is separate from R5 assignment coverage; a completed trip retains
its confirmed assignment history while releasing the reservation. Driver controls are on ride
details, linked from the driving inbox. Family receipt/status and authorized
activity appear on the same detail screen. Needs attention includes pending
pickups and unfinished handoffs regardless of scheduled end time, using a scoped
UUID keyset cursor so older unfinished trips remain reachable.

## Database boundary, history and retries

The additive `20261027000400_ride_handoffs.sql` migration leaves R3–R5 migrations
unchanged. `ride_handoffs` binds child/family enrollment to a designated guardian;
its checked state/timestamps and version track each child's independent journey.
`ride_trips` freezes the exact assignment and plan revision on first pickup.
`ride_events` binds each transition to that child/trip with one event per stage,
trusted authenticated actor/name and a database timestamp. Composite foreign keys,
non-null requirements, constraints, indexes, explicit grants and RLS protect the
new data. Events also have an UPDATE/DELETE rejection trigger.

Normal server clients retain public keys and verified user sessions. Public
invoker RPCs call private fixed-search-path definer commands. No caller supplies
an event actor, event time, previous state, resulting state or a ride-wide
completion flag. Direct table INSERT/UPDATE/DELETE is denied. RLS grants progress
and history only to current participating guardians and the current assigned
(or completed-trip) driver; removed/unrelated users get no private history.
History shows the stored actor name, ID and timestamp without opening a profile
directory across families.

Commands acquire the inherited ordered family roots, circle and ride locks before
checking mutable authority/state. They compare the plan revision and child version,
validate the exact predecessor, insert the event and change progress in one
transaction. The same timestamp marks the event and its resulting milestone. A
request UUID cannot be reused for a different payload. The forward review fix
`20261027000500_handoff_request_bindings.sql` binds every successful UUID, including
acknowledged duplicate no-ops, to its canonical event in an append-only, RLS-enabled
command-private request ledger. Existing event UUIDs are backfilled on upgrade;
clients cannot read or write deduplication metadata. Cross-ride binding conflicts
roll back any new trip/event/progress atomically. Identical retries and
concurrent identical reports from the same authorized actor/version return the
current state without adding another event. This includes an original-event retry
after completion: it returns terminal state and performs no write. Different
versions, competing payloads, skipped/backward transitions and attempts to reopen
terminal journeys fail. Family/ride locking serializes the final receipts and
membership changes; there is no client count-then-complete operation.

## Inherited mutation audit

| Mutation | Before first pickup | Started or completed trip |
| --- | --- | --- |
| Whole-ride cancellation | R4 creator authority; R5 closes proposals and releases reservations atomically | Rejected; historical plan cannot be rewritten |
| Driver withdrawal, proposal cancellation, consent revocation | R5 invalidation and fresh-consent behavior retained | Rejected; cannot release active responsibility or rewrite terminal history |
| Rider enrollment/withdrawal, route/time/location changes | Existing R4/R5 revision and assignment guards | Rejected for the frozen trip |
| Recipient designation | Own-family active guardian; valid same-family recipient, revision/version checks | Rejected for every child, including children still scheduled |
| Responsible adult removal | Existing membership authority; future R5 consent/driver invalidation retained; removed recipients fail first-pickup validation | While any handoff remains, reject removal of driver membership, designated recipients or consent grantors |
| Circle-family removal | Existing authority; future R5 assignments invalidated | While any handoff remains, reject removal of driver context or any enrolled family |
| Other guardian removal | Existing authority and last-owner/coordinator rules | Allowed if they have no driver/recipient/consent responsibility |
| Child profile edits | Existing own-family revision checks | Ride-specific name/restraint snapshots remain unchanged |
| Vehicle update/retirement | Existing R5 dependency guards | Rejected while assigned; final receipt releases the reservation, permitting later vehicle edits |

Membership removal uses current database records, not JWT role claims. Its guard
shares scope locks with first pickup and ignores scheduled-end expiry: unfinished
responsibilities remain protected. After the whole trip completes, ordinary
membership removal is permitted, immediately revokes private reads and leaves
completed trip history immutable. R5 invalidation skips frozen trip history but
continues to invalidate affected future rides in the same removal transaction.
Account deletion, incidents, no-shows and active-trip driver replacement require
separate designs and are outside these ordinary commands.

## Validation and release boundaries

`npm run test:auth` owns a disposable backend on 55320–55329, preserves real
R2/R3/R4/R5 fixtures through upgrades, compares clean/upgrade generated types,
and tests real public-key password sessions and independent Chromium accounts.
It never resets the developer's `pool` backend. Admin access is confined to
synthetic fixtures and deliberate fault/lock injection. `npm run test:db` runs the
database subset; `npm run db:types` regenerates the checked-in public types.

R6 adds `scripts/handoff-permissions.mjs`, command-service regressions and
`tests/auth/handoffs.spec.mjs`: multi-child persistence and separate completion,
duplicate/concurrent receipts and successful duplicate UUID reuse across children/rides,
actor and recipient denials (including an ordinary
driver and a nondesignated same-family guardian), receipt before arrival, stale
versions/request reuse, fabricated events/direct writes, scoped and revoked
history, start revalidation, atomic rollback on event failure, removal/pickup races,
active-trip mutation guards and terminal protection. The real browser journey
uses separate driver/guardian accounts, mobile keyboard controls, navigation and
reload persistence, and cross-account replay of actual receipt RPCs.
Inherited CI now admits the R5 stacked base and retains its complete checks.

Hosted setup, isolated provider environments, SMTP/origins and hosted acceptance
remain pending as documented in `deployment.md` and `authentication.md`. Local
checks and the existing skipped Supabase Preview integration do not establish
hosted verification. No provider changes or production deployment are included.
No GPS, maps/ETA, location sharing, notifications, external recipients, emergency
workflow, active-trip replacement, calendar, native work or visual parity.
Stop for user review; do not merge or begin R7.
