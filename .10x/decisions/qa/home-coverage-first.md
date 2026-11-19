# QA: home-coverage-first
- Report: `.10x/reviews/2026-11-18-qa-report.md`.
- Gate: `npm run check` passed locally on Node 24. **`test:auth` must pass in CI before merge** (not run locally).
- Bugs found and fixed during verification: nested panel (region was a Section), offer form overflowing a 47% card, and the CommandForm empty text node.
