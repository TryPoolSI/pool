# Staff Engineer: home-coverage-first

- Reuse the existing `ride-list` / `ride-card-*` classes (from `ride-list.tsx`) for Home cards so Schedule and Home share one card language. Add only the `coverage-summary*` classes to `styles.ts`.
- Element layer: add `id` passthrough to `UI.Button` (Pressable `nativeID`) so focus can return to the trigger. Keep `I can drive` as the accessible name (exact-match tests).
- One link per ride row (tests). The route title is the link, with no extra "View ride".
- Never place bare strings in `UI.Box`/`Label` children except the label text. This fixes "A text node cannot be a child of a <View>".
- Update `tests/auth/home.spec.mjs` only for the approved covered-circle behavior. Every other selector stays valid.
- Craft floor: no eyebrow, no one-sided bars, no shadows, palette tokens only.
