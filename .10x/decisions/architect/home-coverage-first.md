# Architect: home-coverage-first

- **Components:** `page.tsx` (order and heading) → `HomeDriverCoverage` (owns the query) → `CoverageSummary` + `Driver coverage` region → per-circle group → `RideCard` → `HomeDriverOffer` / `OfferForm`.
- **Data:** a single TanStack query, extended per ADR-001. Its result is `{ ridesByCircle, joinedByCircle, cars, waiting }`.
- **Boundaries:** no new RPCs and no writes outside the existing `offerToDrive` command.
- **Failure modes:**
  - Coverage throws → the region shows the alert and retry, and the summary is hidden.
  - Waiting fails → summary falls back to generic copy.
  - `drive_offer_details` missing (PGRST202) → no "I can drive".
- **Focus:** web uses `followAnchor(id)` to focus the form heading and the trigger. Native uses no-op shims, which is existing parity.
- **Time display:** `rideTime` keeps the offset and drops the year in a short variant (`rideTimeShort`). The PRODUCT rule requires the offset. The draft `rideWhen` that dropped the offset is removed.
