# Ride planning (R4)

R4 is stacked on [R3 #5](https://github.com/UWorldJK/pool/pull/5), branch
`lkluge/family-circle-membership` at `4814b2c`. R3 includes R1 and R2. Review
R4 against that branch; retarget and revalidate as predecessors merge. The stack
is not eligible for production release until reviewed migrations reach validated,
protected, PR-merged current `main` and the existing release gates pass.

Guardians register their own family's child display names and seat requirements
at `/app/children`, then plan one occurrence at `/app/rides/new`. At least one
own child is required at creation. Other circle families are invited by family,
never by selecting their private children. Invited guardians join with their own
children, decline, change their own roster, or remove all their riders to withdraw.
The original creating adult can cancel for everyone while still a member of the
creating family and circle. A different guardian or coordinator cannot cancel.
Cancellation is durable and cannot be reopened. No general ride editing exists.

The weekly schedule includes both directions, separate pickup and drop-off,
cancelled plans, and overlapping intervals selected using local week boundaries.
Each ride displays its own timezone and UTC offset, including repeated hours.
Needs attention lists pending family invitations and participating uncovered rides
over the next year; use the weekly date selector for other dates. There is no
ride directory for other circle members. Every active ride is unassigned and
explicitly needs a driver. Past times do not imply completion.

## Privacy and authority

| Data | Visibility |
| --- | --- |
| Base `children` records | Current guardians of the owning family only |
| Minimal offer RPC | Current guardians of an invited/participating family still in the ride's circle; coarse pickup/drop-off labels, direction, interval, timezone, revision, cancellation and own participation only |
| `rides`, exact `ride_locations`, ride-specific `ride_riders` snapshots | Current guardians of joined families still in the circle |
| Family responses | Own family's response; participating families can also read current circle-family responses |
| Another family's full child/profile records | Never authorized by a ride invitation, participation or coordinator status |

Keep invitation labels coarse: do not enter addresses, private notes or child
names in summaries. Exact locations have separate protected storage. Rider
snapshots contain only display name and seat requirement with relational IDs;
joining does not expose the base child record. Child edits leave existing ride
snapshots unchanged until that family's roster is explicitly saved again. Removed
family/guardian access is checked against current database membership on each
read/command, independent of JWT age. Removing a family hides its rider snapshots
from the remaining families. R5 will own assignment invalidation on membership
changes; R4 contains no assignments.

All five new public tables have RLS, authenticated SELECT policies, and no direct
application INSERT/UPDATE/DELETE grants. Anonymous callers cannot read tables or
execute commands. Public invoker RPC wrappers call narrowly granted private,
checked definer implementations with fixed search paths. Actor, timestamps,
revisions, enrollment snapshots and cancellation state are database controlled.
Composite foreign keys bind ride/circle, family/circle, rider/family/ride and
child/family. State, interval, text, timezone and duplicate constraints supplement
the command validations.

Commands lock family roots in UUID order, then circle, then ride, sharing R3's
removal locks. They repeat current guardian/circle checks after acquiring locks.
Every roster/response/cancellation write compares the expected ride revision under
the ride lock and increments it atomically. A competing or cancelled write returns
a conflict; reload and explicitly retry against the new revision. There is no
last-write-wins enrollment or cancellation reversal. Per-family rider lists reject
foreign children, nulls and duplicates. Removing all own riders withdraws the
family and revokes its exact-detail access.

Creation and new child setup use a stable request UUID, retained by the rendered
form across revalidation. Duplicate identical creates return the same ID. Reusing
an ID for a different payload conflicts; a repeated create cannot reopen a cancelled
ride. An identical child-create retry returns the original child; edits require
that child's current revision. Successful creation forms are disabled and link to
the persisted result and a fresh form for another child/ride. Failed forms retain
the entered values so a validation correction does not lose the draft. Failures never show
fake success. Unknown transport failures instruct users to reload before retrying.

## Dates and migrations

Ride instants are `timestamptz`, with an explicit IANA timezone retained separately.
The UI sends local minute values plus independent earlier/later choices for each
endpoint. The server rejects invalid calendar dates, nonexistent spring times,
ambiguous repeated hours without an explicit choice, and nonpositive intervals.
Direct RPC callers provide unambiguous instants; the database rejects nonfinite or
reversed intervals and unknown/abbreviated timezone names. Week boundaries use the
chosen schedule timezone, including 167/169-hour DST weeks. If a boundary date
begins after a skipped midnight, its first valid instant starts the range; entered
ride times in gaps still fail validation. Reads use half-open
overlap (`start < until`, `end > from`) rather than the execution host's timezone.

`20261027000200_ride_planning.sql` is additive after the unchanged R3 migration.
Normal development upgrades use the documented local `supabase db push` command;
never reset the existing developer backend for tests. `npm run test:auth` owns a
separate disposable project/ports, preserves a real R2 identity through R3, creates
an R3 family/circle before upgrading to R4, verifies existing data can plan a ride,
then compares generated public types with a clean reset. Release migration order,
checksums, environment isolation and migration-before-app behavior are inherited.
No hosted migration, deployment, provider configuration or production data test is
implied by local checks. Hosted setup remains as documented in deployment.md.

Validation lives in `scripts/ride-permissions.mjs`, ride action/time unit tests,
and `tests/auth/rides.spec.mjs` alongside inherited Auth/membership browsers. Real
public-key sessions exercise direct Data API/RPC authority/privacy, duplicate and
concurrent writes, stale child/ride revisions, independent login persistence,
removal and cancellation. Browser scenarios exercise authenticated command RPCs,
including replaying under unrelated/coordinator sessions, real manual membership
invitations, DST validation, enrollment, schedule, withdrawal and cancellation.
No vehicles, driver selection, approvals, progress, maps, recurrence, notifications,
native work or visual parity are included.
