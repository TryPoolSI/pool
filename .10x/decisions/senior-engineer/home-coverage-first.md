# Senior Engineer: home-coverage-first

- **Task 1:** use `Intl.DateTimeFormat` with `{weekday:'short', month:'short', day:'numeric', hour, minute, timeZoneName:'shortOffset'}` in the ride zone. Test with a fixed instant and zone (`America/New_York` → contains `GMT-5`).
- **Task 3:**
  - Keep `ride_offers` paging as-is. Add `joinedByCircle` and the `loadWaiting` promise, started before the paging loop so it overlaps.
  - Choose the primary as the soonest uncovered ride with an eligible car.
  - Wrap every state in `UI.Section role="region" aria-label="Driver coverage"`. Errors inside it keep the exact copy "Driver coverage could not be loaded."
- **Task 4:**
  - The trigger gets `id={`offer-${ride_id}`}`. The heading gets `id={`offer-heading-${ride_id}`}`.
  - `useEffect` on open calls `followAnchor(heading)`. On close, set state, then `followAnchor(trigger)` in an effect after the button re-mounts. Use a `returnFocus` flag so the initial render doesn't steal focus.
  - Keep "N riders need seats." and the "X booster seat · Y child seat" strings as single text nodes inside `UI.Paragraph`.
- **Task 7:** footer row becomes `pool.` + flex spacer + quiet `Refresh current data` (plain button style, `styles.plainIconButton`-like with text). Keep `accessibilityRole=button` and the exact label.
- **Tricky parts:**
  - `classStyle` parent rules: `ride-list` children automatically get panel and grid-child styling, so don't wrap list items in extra Boxes.
  - The summary's text color is inherited from the `attention`/`positive` class. Check contrast: amber #785016 on #faf0d8 is about 7:1, and green #255741 on #edf3e8 is about 8:1.
