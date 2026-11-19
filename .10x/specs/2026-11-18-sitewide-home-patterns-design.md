# Site-wide: apply the Home patterns (design spec)

**Date:** 2026-11-18 · **Feature slug:** `sitewide-home-patterns` · **Branch:** `claude/home-coverage-first` (same PR #63)
**User decision:** apply items 1–5 to every other page. Test-locked text and headings stay.

## Items
1. **No kicker labels.**
   - Remove `eyebrow` from Today ("YOUR FAMILY, IN THE LOOP") and ride detail ("Outbound/Return ride", "Your driving").
   - Remove the in-page kickers "THE RIDE PLAN", "CURRENT RIDE" and "A LITTLE PLANNING GOES A LONG WAY".
   - Delete the `eyebrow` prop and class.
   - The driver-panel role label ("Replacement candidate · pending" etc.) keeps its exact text, which tests assert, but becomes a normal small muted label instead of uppercase.
2. **No cards inside cards.** Today's "Needs attention" container and any panel that wraps `RideList` become plain regions, the same approach as the Home coverage region. Check Schedule in the DOM.
3. **Short ride times on Ride cards** (`ride-list.tsx`): use `rideTimeShort` (no year, keeps the offset). Keep the "Outbound · Pickup:" / "Return · Pickup:" prefixes (rides.spec). Detail pages keep the full date.
4. **Drawn icons, not glyphs:**
   - `StatusBadge`: `!` → warning, `✓` → check, `•` → a small dot drawn in SVG.
   - `RouteSummary`: `○` / `▪` → drawn markers.
   - `EmptyState`: `↗` → a drawn icon.
   - All are aria-hidden, so the badge text and accessible names don't change.
5. **One primary per view.** `CommandForm` gets an optional `secondary` flag for its submit button. Ride detail's "Save designated guardian" forms use it, and "Nominate driver" stays primary.

## Constraints (kept)
- Today's h1 "A little planning goes a long way." (iOS journey), and all h1s and button names (journeys).
- "Unassigned — needs a driver" on ride detail; "Needs attention" heading; driver-panel label text.
- PRODUCT timezone rule: offsets stay everywhere.

## Testing
- `npm run check` on Node 24.
- Runtime sweep: no nested panels, at most one primary per view, and no text-node warnings on Today, Schedule, Driving, ride detail, family and circle.
- Visual pass at desktop and 320px.
- `test:auth` runs in CI.

## Out of scope
- Rewording headings.
- Removing the duplicate status line on ride detail (test-locked).
