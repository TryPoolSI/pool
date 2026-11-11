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
public Auth API is independently reachable. A successful signup clears the form
and directs users to their inbox. Sign in, Sign up, and unusable signup links
offer an email-only resend form. Resend and recovery acknowledgments do not
disclose whether an email is registered.

The checked-in confirmation/recovery templates still use configured `.SiteURL`
and token hashes. Opening an email link displays an explicit confirmation action;
it does not consume the token with a GET. Only signup/recovery types are accepted.
The web page also offers opening the equivalent `pool:///auth/confirm` route in an
installed development app. Native cold/warm links route to the same confirmation
screen. Signup verification keeps its session separate and opens Sign in with
a confirmation message. Used, expired or malformed signup links offer resend
and sign in.

`/auth/callback` retains PKCE code exchange, which requires the verifier from the
original browser/device. Return destinations are repeatedly decoded and restricted
to normalized `/app` paths; arbitrary/forwarded origins cannot choose a redirect.
An authenticated user can choose a new password from `/reset-password` too.

Membership invitations remain separate email-bound, single-use capabilities in a
URL fragment. Initial links and hash changes are retained through sign-in, removed
from the visible address, and require separate preview and explicit acceptance.
After confirming in another browser or device, sign in with the invited email
and reopen the original invitation there. Manually copy and deliver invitations;
automated invitation email is not implemented.

## Local and hosted setup

Local Site URL is `http://localhost:3000`, captured mail is
`http://localhost:54324`, and the public API is `http://localhost:54321`. Native
Simulator requests use host loopback. The custom development scheme is `pool`;
production app identity and universal-link associations remain separate work.

Load checked-in template/config changes through normal Supabase stop/start,
preserving existing volumes. Never reset the existing backend for Auth tests.
Hosted SMTP, canonical origins, redirect allowlists, test/production project
isolation and protected deployment setup still require the documented owner
configuration. Use the hosted verification steps below for real mail delivery.

`npm run test:auth` owns a separate backend on 55320–55329, builds the actual Expo
web export and creates real adults through the UI. It verifies captured mail,
separate users, refresh rotation, persistence, invalid sessions, recovery, link
expiry/reuse, PKCE, safe return paths, membership/ride authorization and accessibility.
The recovery journey opens captured email in a separate browser context, both
with an empty session and while signed in to a different account.
Native/browser journeys use `npm run test:ios` with full Xcode and Maestro.

The preserved Next.js baseline on commit `85ed3c5` passed its original 12 journeys
before replacement. Baseline inventory and migration evidence are in
[the migration record](expo-migration/README.md).

## Hosted Auth verification

Use the [delivery workflow](deployment.md) for app releases. The Supabase project
owner manages hosted Auth settings and email templates separately. For a protected
test deployment, give each browser profile its own authorized preview access.

### Identify the app and Auth project

1. For test and production, record the web origin, Vercel project and deployment
   ID, deployed revision (`releaseSha` or provider source metadata), and expected
   Supabase project ref. Compare that ref with the hostname of the deployed app's
   Auth requests. Verify the publishable key is accepted by
   `/auth/v1/settings` on that project. Verify distinct project refs for test and
   production. If a hosted iOS build is in use, record its build ID and confirm
   where its Auth requests go too.
2. In each project's Auth settings, snapshot email signup and confirmation,
   Site URL, redirect allowlist, email template subjects and bodies, and the
   configured recovery expiry. Compare Site URL with the approved HTTPS app
   origin without a trailing slash and check exact redirect entries for callbacks
   in use. A verification request with a deliberately invalid recovery token
   and no redirect override can confirm the effective fallback origin without
   sending email or using a real account.
   The checked-in templates append `/auth/confirm` to `.SiteURL` and pass
   `.TokenHash` with `type=signup` or `type=recovery`. The checked-in HTML and
   subjects are in [auth/email](../auth/email). The app makes signup and
   recovery requests using the project default URL. If a test window needs
   an immutable preview as Site URL, coordinate exclusive use of the test
   project and restore its prior URL after verification.
   [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls),
   [email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
3. Identify the active sending path, including any Send Email hook. For SMTP,
   record host, port and From address. Check credentials in the provider
   dashboard, verified domain and SPF/DKIM/DMARC, and provider sandbox,
   suppressions, and link tracking. Record the project email quota,
   signup/recovery cooldowns, endpoint limits, and provider quotas.
   Supabase's built-in SMTP limits delivery to project team addresses. External
   mailboxes require a configured sender that can reach them. Free projects
   created on or after June 3, 2026 also need custom SMTP to edit Auth email
   templates when using Supabase's email delivery path.
   [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
   [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits),
   [template customization change](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier)

### Trace one signup and one recovery request

1. Submit `/sign-up` once with a fresh controlled mailbox outside the project
   team. Record UTC time, the UI result, the `POST /auth/v1/signup` status and
   error code, and any request ID. In the mapped project, correlate the request
   with Auth logs and the user's creation and confirmation state. Follow the
   provider's accepted, delivered, deferred, bounced, or suppressed events to
   inbox, spam, or quarantine. Preserve the first attempt before retrying. If a
   dashboard send is needed for comparison, record the action and use a separate
   disposable account. After the configured cooldown, request another link from
   Pool's `/resend-confirmation` and trace `POST /auth/v1/resend` and the resulting
   message. Open the new link in another browser, verify **Confirm email** is
   required, and check that Sign in shows the confirmation status. Verify
   password sign-in and replay the used link to check the resend path.
   [Supabase Auth audit logs](https://supabase.com/docs/guides/auth/audit-logs),
   [email delivery troubleshooting](https://supabase.com/kb/troubleshooting/not-receiving-auth-emails-from-the-supabase-project-OFSNzw)
2. In browser A, request recovery from `/forgot-password` for a confirmed
   disposable account and correlate `POST /auth/v1/recover` with the mail trace.
   Open the delivered link in a clean browser B. Record the redacted link shape
   and redirect chain. A link to the correct Pool origin with `type=recovery`
   and a token hash should load the confirmation page and leave the token
   usable until **Choose a new password** is pressed. If it fails, check for a
   default Supabase verification URL, a callback code tied to browser A, the
   wrong origin, link rewriting or prefetch, and direct-route serving.
   A dashboard-triggered send can use a different link type. Use a reset
   requested from Pool for acceptance.
3. Press **Choose a new password**. Correlate OTP verification and the verified
   user ID with the intended account. Save the password and check that Pool
   signs out and shows the password-updated message on sign-in. Verify the old
   password fails and the new password signs in. In test, also repeat with
   browser B already signed in to a second disposable account and verify that
   its original password still works.
4. Replay the used link. Request a separate fresh link and let it reach the
   configured expiry before trying it. Both should offer **Request a new
   password reset link**, which opens `/forgot-password`. In hosted test,
   exercise the existing **Open in Pool for iOS** handoff if a matching test
   build is available. Use a fresh link for the iOS attempt.

Record sanitized timestamps, statuses, request IDs and provider message IDs.
Redact email addresses, passwords, Auth headers, tokens, and full links in
shared evidence. Keep the historical signup miss unresolved if retained evidence
cannot establish its cause.

### Apply and verify the fix

Correct the setting or app behavior identified by the trace. Use an owner-approved
transactional sender with a verified domain if the active sender blocks external
recipients. Apply the checked-in templates to the affected hosted project when
they differ.
Coordinate production edits with the release owner and verify the staged routes
before switching any template that depends on the new revision. After test
acceptance, repeat the full signup and recovery cycle on the canonical production
origin. Record the deployed SHA, project ref and redacted results. For a failed
rollout, restore the affected Auth settings or use the
[application rollback](deployment.md#rollback-and-recovery), then recheck the
canonical origin.

Verification needs Vercel deployment metadata and preview access, GitHub Actions
visibility and release approval, Supabase Auth logs and user records, authorized
Auth settings access, provider delivery logs and sender settings, and controlled
external inboxes. DNS access is needed if sender authentication requires changes.
