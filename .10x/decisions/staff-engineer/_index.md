# Staff Engineer: index

## Conventions
- Styling goes only through `className` on `UI.*` elements plus `classStyle()` in `src/ui/styles.ts`. Tokens live in `colors`/`spacing`. DESIGN.md documents the system ("The Carpool Ledger").
- Accessibility contract: 44px targets, visible focus, labelled regions and groups, `role=status`/`alert` for async states. Focus helpers are in `src/ui/platform(.web).ts` (`followAnchor`, `captureFocus`).
- Copy is plain and direct. Errors say what happened and what to do next.
- Tests: Node unit tests `scripts/*.test.mjs`, Jest component tests `tests/components`, Playwright journeys `tests/auth` against an isolated backend (`npm run test:auth`), and Maestro iOS journeys `scripts/ios-journeys.mjs`.
- **Journey tests assert UI strings and roles.** Visible names, regions, groups and links are a contract. Change them only together with the tests.
