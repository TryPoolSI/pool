# Home: coverage first (design spec)

**Date:** 2026-11-18 · **Feature slug:** `home-coverage-first` · **Branch:** `claude/home-coverage-first` (one PR; `main` untouched)
**Source:** Impeccable critique of `src/features/app/page.tsx` (24/40). The user chose: coverage-first structure first, "reorder + summary" (not a full ledger rebuild), all 5 issues, everything on one new PR.

## Problem
Home is ordered like a settings index: Your family → Your circles → Driver coverage → Your vehicles. The content that matters most, rides without a driver, sits third. On phone it's about 1.4 screens down and has no summary. The offer form loses keyboard focus and logs a React Native Web dev error. The vehicles card renders broken. The shell repeats three different taglines.

## Goals / success criteria
1. In the first viewport (320px+), Home says whether any joined ride in the next 7 days needs a driver (amber), or that all are covered (green), and how many rides are waiting on the user.
2. Coverage comes before family and circles. Each uncovered ride is a scannable Ride card.
3. The offer form keeps focus where a keyboard or screen-reader user expects it, says which ride it's for and what happens next, and logs no dev errors.
4. No broken layout on Home at 320, 390, 800 or 1280px, and no horizontal scroll at 320px.
5. Existing product rules and tested contracts hold (below). `npm run check` passes.

## Constraints (contracts we keep)
- **Timezone rule (PRODUCT.md):** every ride shows its own timezone and UTC offset. Rows keep a `Pickup: … GMT±x` line. Only the year is dropped.
- **Region and roles (tests/auth/home.spec.mjs):** the `Driver coverage` region exists in loading, error, empty and data states. One `group` per circle with uncovered rides. One link per ride row (the route). The `I can drive`, `Offer to drive` and `Retry driver coverage` button names, the `Passenger seats you can offer` label and the restraint checkbox label stay as they are. The empty text "No joined rides need a driver in the next 7 days." and the error text "Driver coverage could not be loaded." stay. The form text "2 riders need seats." / "1 booster seat · 1 child seat" stays.
- **Seat default = the car's passenger seats.** This is asserted (4 → 3 → 4). We keep it and drop the critique's "default to rider count" idea.
- **Refresh:** a `Refresh current data` button still exists on every page (component test and iOS journey). It's restyled to sit quietly, not removed.
- **Version bar** ("Pool v…") stays. It was added deliberately in 4cd106d.
- No schema, RPC or permission changes.

## Design
### Page order (src/features/app/page.tsx)
1. Page heading: "Home", with the family name as the description line. **No eyebrow** (Impeccable craft-floor ban; the detector flagged it). The action is a secondary "Plan a ride" link, which also fixes phone reachability.
2. **Coverage summary** panel. It uses the amber wash when anything needs a driver and the meadow wash when nothing does:
   - Title (h2): "N rides need a driver in the next 7 days", or "Every joined ride in the next 7 days has a driver".
   - Meta: "Next: Thu 7:40 AM · Home → Maple Elementary".
   - Foot: "N rides are waiting on your reply, consent or receipt." (from `driver_inbox` pending + `trip_attention`). If that load fails, it falls back to "Check Today's rides…" and coverage still shows. It ends with a text link "Open Today's rides".
   - It's sentence-led, not a big-number hero-metric template.
3. **Driver coverage** region with a section head ("Driver coverage", caption, "Open Schedule" link). Per circle there's an h3 and a `ride-list` of Ride cards:
   - Left: date block (weekday and day, aria-hidden).
   - Title: route link.
   - `Pickup: Thu, Nov 19, 7:40 AM GMT-5`, plus a riders/restraints line when offer details exist.
   - Status badge (amber).
   - Footer: "I can drive". The soonest drivable ride gets the page's single **primary** button.
4. Your family and Your circles panels (unchanged content, now below coverage).
5. The "Your vehicles" setup card is **removed**. It was broken, and Vehicles is already in the sidebar and phone menu.

### Covered circles (approved)
- A circle whose joined rides all have drivers stays visible with a green badge ("All 2 joined rides have a driver").
- The test assertion `southRides toHaveCount(0)` would then be updated to assert the green state.

### Offer form (src/features/app/home-driver-offer.tsx)
- On open, focus moves to a new form heading, "Offer to drive · Thu 7:40 AM · Home → Maple Elementary". On close or cancel, focus returns to the "I can drive" button (stable `id`).
- A next-step line: "Once you offer, each family on this ride approves you for their own children. The ride is covered when every family has approved." (This matches `offer_to_drive` → accepted proposal awaiting consent.)
- "Close offer form" becomes "Cancel".
- Fix the stray text nodes. String children are rendered only inside text elements.

### Shell (src/ui/shell.tsx) and membership status
- Remove the sidebar sign-off "A little coordination. A lot of peace of mind." and the footer "A smoother ride for every family.". "Share the driving" stays as the one tagline (the sidebar circle card).
- Move `Refresh current data` into the footer row as a quiet button.
- `FamilyMembershipStatus` errors are shown in a bordered amber notice instead of a bare paragraph.

### Styles (src/ui/styles.ts)
- New classes: `coverage-summary`, `coverage-summary-main`, `coverage-summary-foot`. All tokens come from the existing palette. No shadows and no one-sided bars.

## Error handling
- The coverage query throws, so the region shows the alert and retry, and the summary is not shown.
- If the waiting-count failure happens alone, the summary falls back to generic text.
- If the offer-details RPC is missing (PGRST202), the cards render without "I can drive" (existing behavior).

## Testing strategy
- `npm run lint`, `typecheck`, `test:unit`, `test:components` and `build` (via `npm run check`).
- Update `tests/auth/home.spec.mjs` only where the design intentionally changes behavior: the covered-circle state, if approved.
- Visual check of seeded Home at 320, 390, 800 and 1280px, including the focus round trip on the offer form, with no console errors.
- `npm run test:auth` needs Node 24 and the isolated backend. It runs in CI. Locally we report whether it could run.

## Out of scope
- The eyebrow on other pages, recurring offers, a full week-ledger Home, the sidebar circle-card copy, and the generic "Your circles" title.

## Resolved decision
1. Covered circles: **show the green state** and update the test (user approved 2026-11-18).
