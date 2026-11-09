# Authentication

The Expo migration replaces the Next.js cookie proxy and Server Actions with a
shared Supabase authentication client. Account identities and backend authority
remain unchanged. Existing accounts work; old Next.js browser sessions need a
fresh sign-in.

## Sessions and authority

Web persists sessions in browser storage under `pool-auth-v2`; iOS uses a
SecureStore adapter with bounded Unicode-safe chunks and a manifest published
only after all chunks are saved. Invalid manifests or missing chunks do not
produce a partial session. Local sign-out deletes persisted session data;
password replacement requests global sign-out. Access tokens can remain valid
until their expiry after refresh tokens are revoked.

Protected navigation waits for remote `auth.getUser()` verification and requires
a confirmed, non-anonymous email identity. Database RLS and transactional commands
repeat authorization independently of route guards or stored user objects. The
client uses only `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; no service-role or secret client exists.

Account changes cancel and clear query caches. Native foreground/background
transitions start/stop token refresh, and focus/reconnect refresh authorized data.
Mutations are not automatically retried or queued offline.

## Email and links

Adults sign up with email/password and explicit adult attestation. Passwords are
12–128 characters; configure the hosted Supabase minimum to 12 too, since the
public Auth API is independently reachable. Recovery responses do not disclose
whether an email is registered, and provider errors are mapped to useful copy.

The checked-in confirmation/recovery templates still use configured `.SiteURL`
and token hashes. Opening an email link displays an explicit confirmation action;
it does not consume the token with a GET. Only signup/recovery types are accepted.
The web page also offers opening the equivalent `pool:///auth/confirm` route in an
installed development app. Native cold/warm links route to the same confirmation
screen. Used, expired or malformed links fail closed.

`/auth/callback` retains PKCE code exchange, which requires the verifier from the
original browser/device. Return destinations are repeatedly decoded and restricted
to normalized `/app` paths; arbitrary/forwarded origins cannot choose a redirect.
An authenticated user can choose a new password from `/reset-password` too.

Membership invitations remain separate email-bound, single-use capabilities in a
URL fragment. Initial links and hash changes are retained through sign-in, removed
from the visible address, and require separate preview and explicit acceptance.
No preview/acceptance occurs just because a link was opened. Manually copy and
deliver invitations; automated invitation email is not implemented.

## Local and hosted setup

Local Site URL is `http://localhost:3000`, captured mail is
`http://localhost:54324`, and the public API is `http://localhost:54321`. Native
Simulator requests use host loopback. The custom development scheme is `pool`;
production app identity and universal-link associations remain separate work.

Load checked-in template/config changes through normal Supabase stop/start,
preserving existing volumes. Never reset the existing backend for Auth tests.
Hosted SMTP, canonical origins, redirect allowlists, test/production project
isolation and protected deployment setup still require the documented owner
configuration. No hosted Auth acceptance is implied by local tests.

`npm run test:auth` owns a separate backend on 55320–55329, builds the actual Expo
web export and creates real adults through the UI. It verifies captured mail,
separate users, refresh rotation, persistence, invalid sessions, recovery, link
expiry/reuse, PKCE, safe return paths, membership/ride authorization and accessibility.
Native/browser journeys use `npm run test:ios` with full Xcode and Maestro.

The preserved Next.js baseline on commit `85ed3c5` passed its original 12 journeys
before replacement. Baseline inventory and migration evidence are in
[the migration record](expo-migration/README.md).
