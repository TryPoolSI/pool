# Expo migration guide

PR [#10](https://github.com/UWorldJK/pool/pull/10) replaces the Next.js frontend
with one Expo Router/React Native application for responsive web and iOS, stacked
on PR #9. Existing Supabase migrations, generated types, RLS and RPC contracts
remain unchanged. PR #11's separate prototype is excluded.

## Setup and compatibility

Follow the root [setup guide](../../README.md#local-setup) for Node 24.22.1,
Docker/Supabase, web development and iOS prerequisites. Existing accounts and
records need no migration; old Next.js browser sessions require signing in again.
Rename `NEXT_PUBLIC_SUPABASE_*` settings to `EXPO_PUBLIC_SUPABASE_*` and remove
`SUPABASE_INTERNAL_URL`. Public settings are embedded at build time; secrets must
never enter client settings. See [authentication](../authentication.md) for
session persistence, email confirmation, PKCE and invitation links.

The production container serves the web export on port 3000 with compressed,
immutable assets, private/no-store HTML, direct-route fallback, missing-asset 404s
and uncached `/api/health` liveness JSON. Actions remains the delivery owner;
`checks` requires both `web` and `ios`. Protected-main, trusted-source, environment
and migration ordering gates remain in force. See [deployment](../deployment.md).

## Layout and behavior contract

`exports/pool-v3.html` is the visual reference; `sites/pool-prototype-v3/dist`,
its design notes and behavioral tests clarify rendering and interactions. The
export's malformed font import is preserved; the distribution establishes the
intended DM Sans/Manrope typography. Supplied `sites/` and `exports/` references
are preserved. Generated screenshots and comparison viewers are excluded from Git.

- Retain DM Sans body text, Manrope headings, sage/lime colors, green/amber status
  pills, the 232px desktop sidebar, 85px top bar and rounded card composition.
- Keep persistent phone navigation, safe areas, keyboard avoidance and native
  date/select controls. Web retains browser controls, direct links, back/forward,
  visible focus, dialog trapping/Escape/restoration and 320px reflow.
- Show real family/circle context, children, vehicles and invitations. Today uses
  actual trip responsibilities and attention tasks; schedule retains all seven
  days, both directions and desktop multi-column cards.
- Keep authorized route details, driver/candidate identity, capacity, restraints
  and consent visible. Planning groups route/privacy fields, times/timezone and
  riders; focused dialogs handle secondary mutations.
- Retain drafts and saved/error outcomes through refetches; new destinations reset
  scrolling. Account-scoped caches clear on account changes and refresh on
  foreground/reconnect or explicit request. Writes have no automatic retries or
  offline queue; request IDs remain stable through retries.
- Driver acceptance and each family's own-child consent remain separate. Optional
  swaps preserve available originals; unavailable replacements remain uncovered
  until acceptance and all required consent complete. Arrival requires independent
  guardian receipt per child; only the final receipt completes the ride.

Necessary deviations from the prototype: no map, GPS, ETA, contact/notification
controls, sample identities, simulated replies or automatic approvals. Real
privacy, capacity, deadlines, membership, reservations, revisions, active-trip
freezes and immutable history remain database-enforced. Private invitation and
proposed-driver projections stay minimal until authorization permits details.
Candidate vehicles are labeled explicitly; no original-vehicle snapshot is
invented. Real planning uses a fuller page and full-week visibility.

## Recorded validation and remaining acceptance

The Next.js baseline at `85ed3c5` passed its original 12 browser journeys before
replacement. [baseline.json](baseline.json) records routes, commands, states and
viewports. Migration checks recorded on October 28–29, 2026 include:

- Expo compatibility, lint, TypeScript, 64 unit tests, 7 shared component tests,
  web/Hermes iOS exports, Compose validation and production Linux container smoke.
- All 13 browser journeys across application and focused Auth runs on disposable
  backends: sessions, membership, rides, driver acceptance/consent, replacements
  and independent child handoffs. Layout checks covered 14 matching named views
  at 1440×1000 and 390×844, plus keyboard/focus, saved outcomes and axe at 320px.
- Clean/upgrade schemas, generated-type drift, authorization/privacy, capacity,
  restraints, stale revisions, deadlines, concurrency and release ordering.
- CI at application revision `8539515` passed web/database/container checks and
  the ad-hoc signed Release Simulator build/public-route smoke, including signup,
  sign-in navigation, deep links and restart. Current CI results remain on PR #10.

Local Xcode 27.1 / iPhone 17e (iOS 27.0) checks passed the Release build, public
smoke, real signup/explicit confirmation, family/circle/child/vehicle setup,
session restart and an iOS-created invitation accepted by an independent web user.
The working tree passed 65 unit and 20 component tests. A focused XCTest passed
actual VoiceOver signup traversal; [captured speech](native-voiceover.txt) and
[test source](../../tests/ios/accessibility/PoolAccessibilityTests.m) are retained.
These local results include the native correctness fixes already present in the
working tree before this run.

**Full native acceptance remains pending:** the ride-to-handoff journey currently
stops on an automation scrolling issue that positions a field behind a fixed bar.
Large text, broader VoiceOver coverage and remaining native route/state inventory
are unverified. No Android, physical-device, universal-link or TestFlight
acceptance is claimed.

## Verification

```sh
npm run check
npm run test:auth
npm run test:db
bash scripts/validate-compose.sh
bash scripts/container-smoke.sh
npm run test:ios
```

The browser/database harness owns disposable backends on ports 55320–55329 and
never resets the developer's backend or targets hosted Supabase. Optional
`--watch-browser` retains only that disposable project; enter `q` to clean it up.
For native iteration, use `node scripts/auth-browser.mjs --ios --watch-ios`.
Retries still run xcodebuild and bundle current JS, reusing the generated project;
restart after dependency/native-configuration changes. Disable password AutoFill
in the dedicated simulator during deterministic credential tests, then restore it.
Native captured-mail links have a five-minute TTL; browser expiry tests keep ten seconds.
Replay tests capture actual mutation RPCs and replay them with another adult's
token; UI guards never substitute for database authorization.

`build:ios` exports JavaScript. Simulator journeys additionally require macOS,
full Xcode 26.4+, an iPhone runtime, CocoaPods, Playwright Chromium and Maestro
(`brew install mobile-dev-inc/tap/maestro`). The runner generates the ignored iOS
project and builds an ad-hoc signed Release Simulator app. The signature enables
Keychain/SecureStore access without an Apple certificate, team or provisioning
profile. CI retains native diagnostics and caches toolchain-specific build inputs;
each run still bundles current source and runs smoke checks.

The separate VoiceOver target requires Xcode 27 and an installed Pool app:
`xcodebuild test -project tests/ios/accessibility/PoolAccessibility.xcodeproj -scheme PoolAccessibility -destination 'platform=iOS Simulator,name=iPhone 17e' CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM=`.
It verifies signup traversal; the broader accessibility inventory remains pending.

## Web startup performance

[performance.json](performance.json) retains raw Chromium samples from matching
production builds. With the preserved baseline and Expo export on separate ports:

```sh
node scripts/measure-web.mjs http://localhost:3002 http://localhost:3003
```

| Median measurement          | Next.js baseline | Expo web |
| --------------------------- | ---------------: | -------: |
| Visible screen ready        |            54 ms |   424 ms |
| First contentful paint      |            40 ms |   432 ms |
| Encoded script bytes        |          135 KiB |  442 KiB |
| Signup → sign-in navigation |            90 ms |   367 ms |

This is a material startup/navigation regression from server-rendered Next.js.
The client-rendered shell/shared runtime adds cost despite compression, route
chunks, font-display swap and the web router outlet. Loopback samples do not
establish mobile-network performance or equal loading performance.
