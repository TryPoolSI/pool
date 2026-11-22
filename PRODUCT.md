# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

One shared Pool design language across responsive web and iOS, built from a single Expo Router / React Native codebase. iOS keeps native controls where they matter (date and select pickers, safe areas, keyboard avoidance); web keeps browser behavior (direct links, back/forward, visible focus, 320px reflow). The design does not switch to per-OS conventions.

## Users

Parents and guardians coordinating their children's rides (school, sports, activities) with a small circle of trusted families. They are usually on a phone, fitting Pool in between other tasks, and need to see quickly what is covered, what isn't, and what needs their action.

Roles inside that audience: family **owners** (manage guardians), **guardians** (manage their own children, their place on a ride, and receipt), circle **coordinators** (invite/remove families), and eligible adults who **drive**.

## Product Purpose

Pool lets families share the driving. Adults form families and circles, register children and vehicles, plan rides, put their own children on rides, agree to drive, hand driving over to someone else, and confirm pickup, arrival and per-child guardian receipt. Success: every ride is visibly covered or visibly uncovered, nobody assumes, and every child's handoff is confirmed.

## Positioning

Pool's value is equal parts **trust/accountability** and **less coordination load**. A group chat or spreadsheet can't offer both:

- Each decision belongs to one person and takes one tap: a family joins a ride with its own children, an adult agrees to drive, a guardian confirms receipt. Other families are told about a driver or a driver change; they do not approve it. A family that is not comfortable takes its own children off the ride. Every active ride without a driver explicitly needs one, an unanswered invitation never holds a ride up, and past times don't mean a ride was completed.
- Private by default. Families see other families' children only through ride-specific snapshots (display name and seat requirement). Invitation labels stay coarse. Exact locations are protected.
- Closed loop. Pickup and arrival are reported, and only the final per-child guardian receipt completes a ride.
- At a glance. Home, Today/Needs attention and the weekly Schedule surface uncovered rides and pending actions without back-and-forth messaging.

## Operating Context

- Core flows: sign up/confirm email → create or join a family (manual invitation links, copied and delivered by hand; no invitation mail is sent) → create/join circles → add children (display name, seat requirement) and vehicles → plan a ride at `/app/rides/new` → other families join with their own children (before or after a driver is set) → an adult offers or agrees to drive, which sets the ride → pickup/arrival → per-child receipt.
- Surfaces: Home, Today's rides / Needs attention, Schedule (all seven days, both directions), Driving, Ride detail, My family, Circle, Children, Vehicles, Invitations, Profile, and the auth screens.
- Rides belong to a timezone. Planning uses the device's timezone without asking. A ride shows its UTC offset only when its timezone differs from the reader's.
- Conflicts are real: writes compare revisions. A competing change returns a plain message and the screen shows the latest state; the person retries on purpose. Writes have no automatic retry or offline queue.
- Shared data refreshes itself (on returning to the app and every 20 seconds while visible). There is no manual refresh control.

## Capabilities and Constraints

- Stack: Expo 58, Expo Router, React Native 0.88, React Native Web, Supabase (auth, Postgres, RLS, RPC commands), TanStack Query. Web is deployed via an Expo export served by a Node container; GitHub Actions owns delivery.
- Not implemented (don't design as if present): maps, GPS, ETA, push notifications, contact/messaging controls, recurrence, offline writes, general ride editing, ownership or coordinator transfer.
- Cancellation is durable and can't be reopened. Only the original creating adult can cancel.
- An adult has at most one active family; a family can join multiple circles.
- Feature flags exist (e.g. `EXPO_PUBLIC_SHOW_SAVE_ROUTE` hides Save route).
- Terminology in the interface: family, circle, guardian, ride, rider, driver, car, pickup, drop-off, "needs a driver", "Share the driving". System words (consent, proposal, nomination, revision, replacement, receipt) stay in code and docs; the interface says "ask to drive", "take over", "hand off".

## Brand Commitments

- Name: **Pool**. Logo mark: the Pool car logo (`src/assets/logo-mark.png`).
- Tagline and eyebrow copy in use: "Share the driving".
- Voice: plain, direct and calm. Errors say what happened and what to do next ("Pool could not save the link. Try again, or sign in and paste it under Invitations."). No hype.
- The visual system is drawn from the logo (sky blue, sun yellow, coral, navy, cream; Manrope headings, DM Sans body; Liquid Glass navigation on a phone, sidebar on wider screens). `DESIGN.md` is the authority; tokens live in `src/ui/styles.ts`.

## Evidence on Hand

- Product behavior docs: `docs/membership.md`, `docs/ride-planning.md`, `docs/driver-confirmation.md`, `docs/driver-replacements.md`, `docs/ride-handoffs.md`, `docs/authentication.md`, `docs/deployment.md`, `docs/expo-migration/`.
- Fonts (OFL): `public/fonts/dm-sans.ttf`, `public/fonts/manrope.ttf`.
- None of these exist, and future work must not invent them: testimonials, customer names, usage numbers, pricing, press, App Store presence, or sample identities. The prototype's sample people and simulated replies were deliberately removed.

## Product Principles

1. **Explicit over assumed, with one tap.** A ride has a driver, a rider or a completed handoff only when the person it belongs to actually did it. Nobody approves someone else's decision; they are told about it. The act itself is a single clear button; Pool does not add a second confirmation on top of it.
2. **Privacy is a feature.** Show other families' data only as far as the user is authorized to see it. Keep labels coarse and never leak child details through convenience.
3. **What needs me, first.** Lead with the user's own pending actions and uncovered rides. Everything else is secondary.
4. **Calm under conflict.** Conflicts, expiries and errors are normal states. Explain them plainly, keep what the person typed, and make retrying a deliberate step.
5. **One product, two platforms.** Keep a single Pool identity while respecting native input controls and browser behavior.

## Accessibility & Inclusion

- WCAG 2.1 AA baseline. axe-core checks run in Playwright, and VoiceOver passes are recorded for native (`docs/expo-migration/native-voiceover.txt`).
- Required: visible focus, dialog focus trapping with Escape and focus restoration, 320px reflow, 44px minimum controls, reduced-motion support, forced-colors support, skip link on web.
