# Deployment

> Expo migration: the application now exports one React Native Web SPA. The
> container serves `dist/` through `scripts/serve.mjs`, including compression,
> direct-route fallback and unchanged uncached health JSON. `CI / checks` is an
> aggregate of `web` (Linux/database/browser/container checks) and `ios` (macOS
> simulator build/component/smoke checks). The delivery guard requires all three
> exact jobs to succeed. Existing trust, migration and protected-main gates below
> remain authoritative. Earlier Next.js-specific validation records describe the
> pre-migration baseline, not the current runtime.

## Delivery contract

GitHub Actions is the sole delivery owner. `CI / checks` validates the exact PR
head or merged `main` SHA with Node from `.nvmrc`: `npm ci`, `npm run check`,
Compose validation with a disposable placeholder environment, and the final
`linux/amd64` container smoke. Forks receive these checks without release secrets.
The smoke needs no database and checks homepage content, all linked CSS,
`robots.txt`, and exact uncached `/api/health` JSON. Health means application
liveness, not Supabase/database readiness. Existing public-key Auth connectivity
checks remain separate from database/RLS tests.
CI pins Compose 2.40.3 because the hosted runner's bundled version rejected the
repository's existing Watch `initial_sync` setting; developer machines need 2.32+.

`Delivery` starts only after CI completes. It is inert unless the repository
variable `DELIVERY_ENABLED` is exactly `true`. There is no manual target selector,
`pull_request_target`, downloaded artifact, untrusted cache or PR checkout in the
privileged workflow. Its scripts come from the immutable default-branch workflow
revision. Candidate code is archived without executing its scripts locally and
uploaded for Vercel's remote container build using pinned CLI 65.4.0.
Secretless CI and release setup verify this installed CLI's actual command
definitions and invoke generated preview/production arguments with `--help`.
Version 65.4.0 uses `--environment`; `--target` is its deprecated alias.

The [Vercel container path](https://vercel.com/docs/functions/runtimes/container)
stays `Dockerfile.vercel`, the Container preset and Vercel's own registry. There is
no extra registry. `vercel.json` disables automatic
Git deployments with
[`git.deploymentEnabled: false`](https://vercel.com/docs/project-configuration/git-configuration).
The provider Git integration must also be disconnected, including deploy hooks
and other automation that could race Actions.

## Required owner setup (pending)

The available GitHub connection has push access but no repository-admin access.
No Vercel project link or deployment credentials were available in the R1 checkout.
Provider configuration and hosted execution are **not verified**. Do not enable
delivery until an owner has completed the following setup. No accounts, projects,
subscriptions or paid features were provisioned by this change.
GitHub reports a pre-existing **Supabase Preview** integration, skipped on this
PR; it does not establish the test/production mapping. Audit its automatic branch
creation/schema synchronization and disable competing delivery before R3 makes
Actions responsible for migrations. Do not create a database per PR for this plan.

1. Protect `main`: require PRs, at least one review, dismissal of stale approvals,
   **checks** from the **CI** workflow, and branches up to date before merging.
   Apply rules to administrators, deny bypasses/direct pushes and force pushes,
   and restrict editing workflow/delivery configuration to trusted maintainers.
   Disable Actions sending write tokens to fork PRs. Keep the default token
   read-only and review third-party actions against their pinned revisions.
2. Identify two distinct hosted Supabase projects: synthetic test data only in
   test; real production data only in production. Select their canonical
   `https://<project-ref>.supabase.co` URLs and modern `sb_publishable_...` keys.
   Localhost, Docker URLs, custom proxy URLs and legacy JWT keys are rejected by
   delivery. Normal session helpers retain their existing public-key behavior.
3. Identify separate Vercel test and production projects in separate access scopes.
   Use existing authorized scopes if available; any account or paid-scope creation
   needs a separate owner decision. A test-scoped token must receive 403/404 when
   querying the production project in its scope; the preflight enforces this.
   Keep production credentials only in the production GitHub environment. A single
   token with access to both scopes fails preview preflight.
4. Set each Vercel project to Container, repository root, no build overrides,
   `PORT=3000`, and disconnect its Git integration. Remove deploy hooks and
   competing/manual release automation. Store only the matching public URL/key
   and `PORT` there; no internal URL, admin/migration credential or Vercel token
   belongs in Vercel build/runtime variables, including shared/integration values.
   The preflight audits project identity, framework, Git disconnection and the
   environment variable allowlist. Actions supplies both public settings at build
   and runtime on every upload. Disable integrations that inject other credentials.
   Disable project OIDC tokens and automatic system-variable exposure; this app
   needs neither. The preflight checks these flags and the CLI's resolved
   environment, including inherited values, for matching public settings only.
5. Create GitHub environments **preview** and **production**. Allow deployments
   only from `main` (the privileged `workflow_run` context), require maintainer
   approval, disable self-approval and administrator bypass. Review the candidate
   SHA shown in the gate summary before approving; a PR can change its Dockerfile
   and build scripts. Never approve fork/untrusted source. GitHub plan support for
   these protections must be confirmed before adding secrets. Do not use
   repository-wide deployment secrets. Delivery jobs declare read-only permissions.
6. Set the variables/secrets below. Verify project/scope ownership and deployment
   protection. Add each project's automation bypass secret only when protected
   deployments need it. It is a GitHub environment secret, never an app variable.
7. Vercel's first deployment is production even without `--prod`. After R1 is
   merged and checked, bootstrap only the isolated **test Vercel project** with
   that checked revision and test public settings, then verify its four smoke
   targets. Keep `DELIVERY_ENABLED` off during this owner-controlled bootstrap.
   Preview preflight requires an existing test production baseline so a PR cannot
   become a project's first production deployment. The real production project
   can receive its first staged deployment through the merged-main job.
8. Enable `DELIVERY_ENABLED=true`, rerun CI on current merged `main`, approve the
   test then production environments and record their URLs/check results. Open a
   small trusted PR to demonstrate a preview after the workflow is on `main`.
   CI workflow changes must merge before preview delivery; this prevents a PR
   replacing its own checks with a successful no-op. Rebase subsequent PRs when
   this check reports a mismatch. R1 cannot preview through a default-branch
   workflow that has not yet merged.

Repository variables (identities are public configuration, never credentials):

| Variable                                                   | Value/purpose                                                     |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| `DELIVERY_ENABLED`                                         | Leave absent/false until setup is verified; `true` enables gates. |
| `TEST_SUPABASE_URL`                                        | Canonical HTTPS URL for the isolated test project.                |
| `PRODUCTION_SUPABASE_URL`                                  | Distinct canonical production URL.                                |
| `TEST_VERCEL_PROJECT_ID`, `TEST_VERCEL_ORG_ID`             | Expected test project and its scope.                              |
| `PRODUCTION_VERCEL_PROJECT_ID`, `PRODUCTION_VERCEL_ORG_ID` | Distinct expected production project/scope.                       |

GitHub environment variables:

| Variable                             | `preview`                     | `production`                                               |
| ------------------------------------ | ----------------------------- | ---------------------------------------------------------- |
| `DELIVERY_TARGET`                    | `preview`                     | `production`                                               |
| `SUPABASE_URL`                       | Matches `TEST_SUPABASE_URL`   | Matches `PRODUCTION_SUPABASE_URL`                          |
| `SUPABASE_PUBLISHABLE_KEY`           | Test public key               | Production public key                                      |
| `VERCEL_PROJECT_ID`, `VERCEL_ORG_ID` | Match test identity variables | Match production identity variables                        |
| `PRODUCTION_URL`                     | Unset                         | Canonical production HTTPS origin, no trailing slash/path. |

Environment secrets: `VERCEL_TOKEN` scoped only to that environment's Vercel scope;
optional `VERCEL_AUTOMATION_BYPASS_SECRET` for that project's deployment protection;
`MIGRATION_DATABASE_URL` for only that environment's hosted database.
Do not put actual credential values in issues, documentation, Git, images or build
arguments. The CLI receives its token only in the trusted local process; its
output is suppressed on failure. Only public URL/key values are build arguments.
The upload excludes `.env*`, `.vercel`, local Supabase state, prototypes, exports
and development dependencies. No deployment credential is present during CLI
installation, `npm ci`, application checks or the local image build.

## Release guards and ordering

The gate verifies the canonical CI workflow ID/path and the current successful
attempt, including the non-skipped **checks** job. Both the original actor and
rerun actor must have write/maintain/admin permission. Preview additionally
requires a current open non-draft PR to `main`, same-repository source and a
trusted author. Forks, closed PRs and stale heads fail before any environment
secret is requested. Configuration/target swaps fail the environment preflight.
Environment approval is still required for
trusted source; collaborator status is not a substitute for reviewing code.

Production requires a successful **push** CI run for current protected `main`
with an associated merged PR whose merge SHA is that revision. A passing PR run,
direct main push or non-main run cannot choose the production job. Test delivery
and smoke must succeed first. Production builds again with production public
settings, uses `--prod --skip-domain`, smokes the immutable URL, rechecks freshness,
then promotes and smokes the configured production origin. `EXPO_PUBLIC_*` values
are frozen in browser assets, so the test build is never promoted to production.
The provider must confirm deployment project/target/SHA/readiness and production
domain ownership before smoke requests receive a protection bypass header.
Supabase Auth settings must accept the selected public key in preflight; this
does not certify SQL/RLS or database readiness.

The secretless admission workflow has no shared concurrency group: rejected or
failed CI events cannot evict an eligible queued release. Only a successful gate
calls `release.yml` at the same trusted revision. One non-cancelling workflow
concurrency group there covers all test and production steps, including
environment waits, remote builds and promotion. GitHub's documented
[`queue: max`](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency#example-queueing-multiple-pending-runs) retains up to 100
admitted pending releases instead of replacing pending main with a later preview;
when full, new entries are rejected. Dispatch order still does not establish
revision freshness. Every admitted run re-reads current GitHub state before
upload and after remote smoke, immediately before production
promotion. An older queued/retried main revision cannot overwrite a newer release.
A newer commit arriving during a remote build leaves the stale deployment
unpromoted. Fresh preview URLs are immutable; no shared test alias is promoted.
Manual provider operations must not run alongside this owner/lock.

R3 replaces the schema barrier with versioned SQL execution. Only timestamped files
in `supabase/migrations/` may contain deployment SQL. The exact R2 local Auth-mail
configuration remains the only allowed Supabase configuration change. Symlinks,
submodules, archive-changing `.gitattributes`, tracked private/local files,
programmatic Vercel configuration, altered upload ignores and altered CI/Vercel
configuration remain blocked. Candidate application scripts never run locally with
release credentials.

Each release job installs pinned `pg@8.16.3` as an isolated trusted tool before
credentials are available. The protected environment supplies its own
`MIGRATION_DATABASE_URL` secret, separate from Vercel and all app configuration.
The executor verifies the connection's project against the selected public URL;
only the direct project host or a session pooler whose username identifies that
same project is accepted. Use port 5432, database `postgres`, an encoded password,
and no URL query options. TLS certificate verification is always enabled. Owners
must verify runner connectivity/certificates; transaction poolers on port 6543,
localhost and target swaps fail closed. Do not copy connection values into Git,
documentation, issues, images, build arguments, public variables or Vercel.

Before connecting, the executor checks that the GitHub environment requires
reviewers and prevents self-review. Review the exact candidate SHA and SQL before
approving the environment; also disable administrator bypass as required above.
One release lock spans test and production. A database advisory lock additionally
serializes migration sessions. Every migration runs in its own transaction and
records Supabase-compatible history plus a checksum in the non-exposed
`pool_delivery` schema. Applied history must be an exact prefix of the reviewed
candidate, with matching checksums. Unknown, edited, deleted or out-of-order
history stops release for owner reconciliation. CI also rejects changes to
inherited migrations. Once applied to shared test, append forward fixes only.
Do not run a competing hosted CLI push or manually alter migration history.

The sequence is: revalidate current successful CI/source; audit target/provider;
apply and verify reviewed test migrations; recheck freshness; deploy and smoke
the test app. Only validated PR-merged current `main` then enters the separate
production environment, applies those same migrations to production, builds with
production public settings, smokes and promotes. A migration error rolls back that
migration and prevents app upload. Earlier successful SQL stays applied and needs
a forward fix if the release later fails. Error output containing database details
is suppressed. No hosted reset/seed or migration during image build/startup exists.

R4 is stacked on R3, which includes R2 and R1. CI runs against
`lkluge/family-circle-membership` as well as the earlier bases. R4 adds
only the next ordered ride-planning migration; inherited migrations remain unchanged. Stacked PRs remain
ineligible for automatic hosted delivery: the inherited preview gate requires a
PR to `main`, trusted merged workflow/CI configuration and environment review.
Stacking never authorizes production. Retarget after predecessor merges and
revalidate the new revision. Missing hosted credentials/protections and actual
hosted migration/deployment verification remain pending owner setup.

## Verification record

Local verification on October 26, 2026:

| Check                                                              | Observed result                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh `npm ci` and `npm run check` in Node 24.22.1 Linux container | Passed lint, type checking, all 36 tests (including the original 12) and production build; `NODE_ENV=production` during check. No prototypes or real environment file in the image.                                                                   |
| Disposable Compose validation                                      | Passed without reading/replacing the developer's `.env.local`.                                                                                                                                                                                        |
| Final `linux/amd64` production image                               | Homepage, all linked CSS, robots and health smoke passed; no mounts, unprivileged user, no hosted backend.                                                                                                                                            |
| Workflow and shell validation                                      | `actionlint` 1.7.12 passed the three workflows with only its unsupported `queue` diagnostic excluded; guard tests verify the documented `queue: max` value and admission before the lock. Shell syntax passed. Hosted lock execution remains pending. |
| Vercel CLI 65.4.0                                                  | Actual installed command definitions and generated preview/production help invocations passed without credentials; hosted dry-run could not proceed without credentials. No deployment attempted.                                                     |
| GitHub Actions CI                                                  | [Run 2](https://github.com/UWorldJK/pool/actions/runs/40449288052) passed checks, Compose and production-container smoke on `e33500d`; latest-head results remain visible on the PR.                                                                  |

Local automated evidence and hosted evidence are separate. The PR records the
exact tested commit and completed CI results. Guard tests exercise failed/skipped
checks, wrong workflow/branch, direct pushes, forks/untrusted actors, stale PRs
and queued main, target/URL/project/key mixups, alternate SQL rejection, migration isolation/failure ordering, Git duplicate
deployment settings, provider audit failures and false-positive smoke responses.
Mock provider responses verify decision logic; they do not demonstrate a hosted
deployment or prove account configuration.

Pending owner/provider verification: branch/environment protections, two Supabase
projects, two isolated Vercel scopes/projects/tokens, Git disconnection, shared
variable/integration audit, deployment protection bypass, test baseline, one real
trusted preview, first production release after the user's merge, and deliberate
stale-run/failure exercises against the hosted provider. No unrun deployment is
recorded as successful. Existing local Supabase data is never reset for CI.

## Rollback and recovery

Set `DELIVERY_ENABLED=false` first. This prevents new gates but does not stop an
already admitted release: let all active Delivery runs finish or reject their
pending environment approvals before changing domains. Do not cancel a future
in-flight migration. Confirm the release lock is idle, then an authorized owner
selects the last healthy deployment **in the production project**, verifies it was
built with production settings and uses Vercel Instant Rollback (or the pinned
CLI's `rollback <verified-deployment-url>`). Never promote a test-project image.
Run `node scripts/smoke.mjs https://your-production-origin` afterward; protected
deployments need the trusted automation path or owner access.

Application rollback does not roll back SQL. Keep migrations additive/backwards
compatible so the old app can run during recovery. A database incident needs a
separately reviewed forward fix, never a hosted reset or destructive automatic down
migration. Migration credentials stay in protected GitHub environments and never enter the app.

Fix through a reviewed PR and merge to `main`. Re-enable delivery only when ready
to release current checked main. The staged deployment is smoked and promoted
through the same lock and freshness gates. Promotion also resumes domain
assignment after rollback; see
[Vercel rollback recovery](https://vercel.com/docs/cli/rollback#undo-a-rollback).
If canonical-origin smoke fails after promotion, treat the release as failed and
perform this rollback; the workflow does not pretend promotion is transactional.

## Costs and future setup

Local checks do not provision hosted services. Owners must verify current plan
eligibility, project/scope limits, approval protection availability and spending
alerts using [Vercel plans](https://vercel.com/docs/plans) and
[Supabase pricing](https://supabase.com/pricing) before approving any purchase.
R2 adds local Auth mail and sign-in; see [authentication setup](authentication.md)
for test/production SMTP, canonical origins and the still-pending hosted cycle.
R3 adds the membership schema and ordered migration executor. R4 adds persisted ride
planning and enrollment; driver assignment remains deferred.
