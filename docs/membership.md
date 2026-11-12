# Families, circles and invitations (R3)

A confirmed adult without an active family lands in **Profile** at `/app/profile`.
Choose **Create a family** and enter your personal name and family name. Creation
saves their profile and owner membership in one transaction. Open a family to
see guardians, invite a guardian, remove membership, or create a circle. Family
owners manage guardians.
Guardians may leave their own family. The last owner cannot leave or be removed.
There is no self-promotion, ownership invitation or general membership write API.
An adult can have at most one active family membership. A family can join multiple circles.

The adult creating a circle must own its initial family. They coordinate family
membership, with their family joined in the same transaction. Open the circle to
see its limited family-name roster and invite another family. Circle invitees
can use the family they own or create a family during acceptance if they have
no active membership. Guardians ask the coordinator to invite their family’s
owner. The coordinator may remove families, and a family owner may leave with
their own family. The coordinating family and adult must remain. Ownership and
coordinator transfer are deferred. Circle membership grants no driver approval
or authority over another family's guardians.

## Manual invitations

Family guardian and circle-family invitations have distinct scopes. An owner or
coordinator enters the recipient's email and copies the generated link for manual
delivery. No invitation mail is sent. Tokens have 256 bits of randomness; only
SHA-256 digests are stored. Links expire after seven database-time days, are
revocable, and can be consumed once. Raw tokens are returned only at creation,
never in invitation history. Treat a copied link as private and revoke/recreate it
if lost. Owners/coordinators see only their own scope's invitation email history;
ordinary guardians and circle members cannot enumerate invitation records.

Ask a family owner for a guardian invitation to join an existing family. Open
the link, paste it from **Have an invitation link?** on Sign in, or choose
**Join a family** in Profile to paste it after signing in. Use the invited,
confirmed email. **Use a different account** returns to sign-in with the same
invitation. The capability is in the URL fragment and is removed from the
address bar after capture. No GET checks or consumes it.
**Check invitation** is an authenticated POST returning a minimal target label.
Acceptance is a separate checked action with an explicit confirmation checkbox.
After creating a family or accepting either type of invitation, Pool opens the
family dashboard. Return to it through **My family**.

The database rechecks verified email, target, scope, expiry, revocation, current
family ownership and consumed status. Membership insertion/optional family
creation and consumption commit together. Losing concurrent acceptance rolls back,
including any new family. Used/revoked/expired links require a new invitation.
Removal revokes outstanding guardian links for that adult; circle-family removal
revokes outstanding circle links addressed to that family's current owners.

## Database boundary

All six application tables have RLS and explicit grants. Profiles contain only
UUID, display name and creation time; self and current co-guardians can read them.
Families/guardian rosters are private to active family members. Circle members see
circle metadata and a limited family-name roster, not other family records,
profiles or Auth emails. Invitation tables have no client SELECT or write grants,
even for administrators; scoped history/preview functions return safe projections.
Every direct application table write is denied. Session clients use only public
keys and authenticated user sessions, including shared command services.

Public invoker RPC wrappers call checked definer implementations in the
non-exposed `pool_private` schema, with an empty search path and qualified names.
Only specific command and nonrecursive RLS helper execution is granted. Helpers
check current Auth verification and membership records rather than JWT role claims.
Commands derive the actor; caller-supplied owner/actor/role/time fields are absent.
Scope root locks precede invitation row locks; receiving family locks come first
for circle acceptance/removal. Last-owner/coordinator checks share those locks.
Removal affects subsequent reads and commands on the existing session.

## One-family migration preflight

Before rollout, run this read-only audit in each target database. Use a
privileged connection so row-level security does not hide memberships.

```sql
WITH active_memberships AS (
  SELECT user_id, family_id, role, joined_at,
         count(*) OVER (PARTITION BY user_id) AS active_count
  FROM public.family_members
  WHERE removed_at IS NULL
)
SELECT user_id, family_id, role, joined_at, active_count
FROM active_memberships
WHERE active_count > 1
ORDER BY user_id, joined_at, family_id;
```

For each adult in the results, confirm with the affected families which
membership to retain. Before removing an extra owner membership, verify that
another owner remains active. Check the adult's circle coordination and active
trip responsibilities for any removal blockers.
Use the existing family member removal command as an authorized actor. It keeps
the membership row and preserves family IDs, children, rides, circle links, and
completed history. Review any pending driver coverage or consent that ordinary
removal will invalidate. Hold rollout on blocked cases until the responsibilities
are resolved. Any owner or coordinator handoff requires separate review.

Rerun the audit and require zero rows before applying the reviewed migration. Its
transactional index build also fails if a duplicate appears between the audit and
application. After applying, confirm the new index is valid and rerun the audit.
Apply and verify the hosted database migration before merging the app PR when
using the Vercel Git integration. That deployment path only builds the app.
See [deployment](deployment.md).

## Local checks and generated types

`npm run test:db` creates a fresh temporary CLI project on ports 55320–55329 with
its own network and volumes. It never accepts a caller-provided URL and never
resets the developer's `pool` project or a hosted backend. It upgrades an R2 Auth
identity, verifies that identity survives, rebuilds clean without seeds, compares
both generated schemas and the checked-in public TypeScript types, then exercises
real public-key/password sessions against the Data API and RPCs. Privileged fixture
setup and SQL fault injection are confined to that disposable project. Tests cover
anonymous/foreign/guardian denials, spoofed authority, wrong email/scope, expired,
revoked and replayed tokens, concurrent acceptance and revocation, removal,
last-owner/coordinator protection, limited profiles and hidden digests.

The same harness tests the release executor on a separate throwaway database:
checksums/history, retries, transaction rollback on failed SQL, and failure blocking
app upload. `npm run db:types` regenerates types through this disposable workflow.
`npm run test:auth` includes all database checks plus real Chromium signup/mail/
session regressions and the two-family/guardian invitation workflow, copied links,
reload persistence, wrong-account/revoked screens, removal and mobile/keyboard use.
Mandatory CI runs this combined suite without hosted credentials. `npm run check`
continues to cover lint, types, regression tests and the production build.

For an existing local backend, apply the additive migration with
`npx supabase db push --local --network-id pool-local`; do not reset it for tests.
Hosted execution follows [ordered delivery](deployment.md), after owner setup and
independent review. No hosted migration, production deployment or real-data pilot
is implied by local tests or stacked PR checks.

## Verification record

The R3 implementation passed a fresh Node 24.22.1 container check (lint, types,
55 regressions and production build), all seven real Chromium Auth/membership
scenarios, clean and R2-upgrade migration/type checks, real-session permission
assertions and transactional release-failure tests. Compose and the final
`linux/amd64` image smoke passed. Workflow validation passed with only the inherited
`queue` syntax diagnostic excluded from the older local actionlint version.
Hosted migration/deployment, SMTP/origin configuration, environment approvals and
provider isolation remain unverified pending the setup in `deployment.md`.
