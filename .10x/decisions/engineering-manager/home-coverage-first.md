# Engineering Manager: home-coverage-first

Ordered tasks (each under half a day; one PR):
1. `rides.ts`: replace the draft `rideWhen` with `rideTimeShort` (weekday, month, day, time, offset; no year), plus a unit test.
2. `elements.tsx`: add `id` passthrough on `Button`.
3. `home-driver-coverage.tsx`: query per ADR-001, summary, Ride cards, covered-circle green state, region in every state.
4. `home-driver-offer.tsx`: form heading plus focus round trip, next-step line, Cancel, stray-text fix, ride label prop, primary prop.
5. `page.tsx`: order, no eyebrow, family-name description, Plan a ride action, remove the vehicles card.
6. `styles.ts`: `coverage-summary*` classes.
7. `shell.tsx`: remove two taglines, quiet refresh in the footer. `family-membership-status.tsx`: notice styling.
8. `tests/auth/home.spec.mjs`: covered-circle assertion.
9. Verify: `npm run check` and a visual pass at 320/390/800/1280 with the focus round trip.

Risks: Node 20 locally (Expo warns; test:auth may not run); RN Web text-node rules.
