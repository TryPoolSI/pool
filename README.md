# Pool

Pool is a mobile-first Expo application with shared React Native screens for iOS
and responsive web. Expo Router supplies navigation, React Native Web supplies
browser rendering, and Supabase supplies authentication, Postgres, row-level
security and transactional commands.

The web version retains the v3 sage/lime design, DM Sans/Manrope typography,
desktop sidebar and multi-column layouts, phone navigation and focused dialogs.
Adults can manage families/circles and manual invitations, register children and
vehicles, plan rides, explicitly accept driving and consent for their own children,
request driver replacements, and report pickup/arrival and guardian receipt per
child. GPS, push notifications, recurrence and offline writes are not implemented.

## Local setup

Use Node **24.22.1** from `.nvmrc`, npm and a running Docker-compatible runtime.

```sh
npm ci
cp .env.example .env.local
```

Create the backend network once, then start the existing local Supabase project:

```sh
docker network create --driver bridge \
  --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 pool-local
npm run supabase:start
npm run supabase:status
```

On Docker Desktop, use **Settings → Resources → Network → Port binding behavior →
Localhost by default** and verify actual host listeners remain loopback-only.

Set these values in the ignored `.env.local`:

| Variable                               | Local value                                                    |
| -------------------------------------- | -------------------------------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`             | `http://localhost:54321`                                       |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The CLI's publishable key; a legacy public anon key also works |

Existing Next.js installations must rename the two `NEXT_PUBLIC_SUPABASE_*`
variables to `EXPO_PUBLIC_SUPABASE_*`. The shared application no longer uses
`SUPABASE_INTERNAL_URL`. Do not expose a service-role/secret key or database
password through application variables. Client values are embedded at build time.

Start web development on the host:

```sh
npm run dev
```

Or run web through Compose Watch:

```sh
docker compose up --build --watch
```

Compose owns only web; the Supabase CLI owns the backend. The app is at
<http://localhost:3000>, Studio at <http://localhost:54323> and captured local mail
at <http://localhost:54324>. Host-based iOS Simulator requests use the same
`localhost:54321` API. Native tooling runs on macOS rather than inside Docker.

Normal stop/start preserves existing accounts and records:

```sh
docker compose down
npm run supabase:stop
```

Apply existing versioned migrations with `npx supabase db push --local
--network-id pool-local` when necessary. Do not reset the developer backend to run
tests. The supplied `sites/` and `exports/` references are preserved and excluded
from the application.

## iOS development

Install full **Xcode 26.4+**, select it with `xcode-select`, and install an iPhone
Simulator runtime. Command Line Tools alone are insufficient.

```sh
npm run ios
```

The prototype uses `dev.pool.prototype` and the `pool:///` URL scheme. Native
projects are generated from Expo configuration and are ignored by Git. Simulator
builds do not require Apple signing. Physical-device signing and TestFlight are
separate work.

## Validation

```sh
npm run check
npx playwright install chromium
npm run test:auth
npm run test:db
bash scripts/validate-compose.sh
bash scripts/container-smoke.sh
```

`check` runs lint, TypeScript, command/time/delivery/HTTP regressions, React Native
component and secure-storage tests, and web/iOS JavaScript exports. An iOS export
is not a simulator build or proof of native UI acceptance.

`test:auth` owns a separate disposable backend on ports 55320–55329. It verifies
clean/upgrade migrations, unchanged generated database types, real-session
permissions/races and independent-account browser journeys. It never resets the
existing `pool` backend or uses hosted application credentials. `test:db` runs the
database portion; `db:types` regenerates types through the same isolated harness.

For native UI journeys, install Maestro and Playwright Chromium, then run:

```sh
brew install mobile-dev-inc/tap/maestro
npm run test:ios
```

This builds a locally ad-hoc signed iOS Simulator application and exercises native/browser
participants against the harness-owned disposable backend. See
[the migration record](docs/expo-migration/README.md) for acceptance and limitations.

## Production web and delivery

```sh
npm run build
npm start
```

The production container serves the Expo export, compressed assets, direct app
URLs and `/api/health`. Health returns `{"status":"ok"}` without contacting
Supabase; it reports app liveness rather than backend readiness. Private data is
loaded under the authenticated user and never embedded in exported HTML.

GitHub Actions remains the sole delivery owner. `CI / checks` requires the Linux
web/database checks and macOS native build/smoke checks. Existing protected-main,
trusted-source, isolated-backend, migration ordering and approval gates remain in
force. No migration, deployment, merge or store publication is implied by local
validation. See [deployment](docs/deployment.md).

Backend behavior is documented in [membership](docs/membership.md),
[ride planning](docs/ride-planning.md), [driver confirmation](docs/driver-confirmation.md),
[handoffs](docs/ride-handoffs.md) and [replacements](docs/driver-replacements.md).
