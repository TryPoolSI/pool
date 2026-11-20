# SDE: home-coverage-first

## Built
- `src/lib/rides.ts`: `rideTimeShort` (no year, keeps the offset), with a unit test in `scripts/ride-time.test.mjs`.
- `src/features/app/home-driver-coverage.tsx`:
  - Query extended per ADR-001 (`joinedByCircle`, `waiting`).
  - `CoverageSummary`, `CoverageRegion` (a plain region in every state, not a panel), and `RideCard`.
  - Covered-circle green state, and a single primary on the soonest drivable ride.
- `src/features/app/home-driver-offer.tsx`: ride-named heading, focus to the heading on open and back to the trigger on close (`followAnchor`), next-step line, Cancel, and an `offer-form` full-width class.
- `src/features/app/page.tsx`: coverage first, no eyebrow, family name as the description, "Plan a ride" action, vehicles card removed.
- `src/ui/shell.tsx`: sidebar and footer taglines removed; refresh is now a quiet footer button.
- `src/ui/styles.ts`: `coverage-summary*` and `offer-form` classes.
- `src/ui/elements.tsx`: `Button` forwards `id` → `nativeID`.
- `src/ui/command-form.tsx`: fixed `{link && …}` rendering `""` inside a View. **This was the root cause of the "Unexpected text node" dev error on every form**, not just Home.
- `tests/auth/home.spec.mjs`: covered-circle assertions updated to the approved green state.

## Deviations from plan
- **Membership error notice dropped.** The message is already friendly ("Your family membership could not be loaded.") and `role=alert` already renders the alert box. Wrapping it would nest boxes. The critique finding was a false positive.
- **The coverage region is a `Box`, not a `Section`,** because `UI.Section` always adds `panel`, which nested the Ride cards inside a card.
- **The text-node fix landed in shared `CommandForm`,** so it affects every form. It's a behavior-neutral render fix.

## Tech debt
- The "waiting" count logic is near Attention's `loadAttention` but not shared (ADR-001 risk).
- The eyebrow is still used on other pages (out of scope).
- "GMT-5" can wrap after the hyphen at 320px (cosmetic).
