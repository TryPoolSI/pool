# SDE: sitewide-home-patterns

## Built (commits 8ec8da4, d161326, db92cf7, ad6f20d)
1. Kickers removed:
   - PageHeading `eyebrow` prop deleted.
   - Today: page eyebrow, "CURRENT RIDE" and "A LITTLE PLANNING…".
   - Ride detail: "Outbound/Return ride" and "Your driving" moved into the description; "THE RIDE PLAN" removed.
   - Driver-panel role label kept verbatim as `meta-label`.
2. Nesting: Today's "Needs attention" is a plain container. **Also found and fixed:** My family's child cards sat inside the Children panel, so they are now `child-row` rows (group role and seat text kept).
3. Ride cards: `rideTimeShort` for pickup, drop-off and reply-by.
4. Glyphs → icons: StatusBadge (warning/check/dot), RouteSummary (ring/flag), EmptyState (leaf). Added `dot`, `ring` and `flag` to the icon set.
5. CommandForm/HandoffForm `secondary`. Button honors `secondary` over submit. Ride detail's guardian saves are secondary.

## Extra fix found during verification
- My family: `FamilyVehicleSetup` and `FamilyChildren` shared a React key, which logged a duplicate-key error. Keys are now prefixed.

## Deviations
- Schedule needed no change (no wrapping panel).
- Detail pages keep full dates with the year by design. Only cards are shortened.
