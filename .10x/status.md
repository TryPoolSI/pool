# Status

**Phase:** Phase 0 complete. Spec approved 2026-11-18 (covered circles show green state)
**Feature:** home-coverage-first (branch `claude/home-coverage-first`)

## Progress
- [x] Discovery: `.10x/decisions/*/_index.md` [DISCOVERED]
- [x] Spec: `.10x/specs/2026-11-18-home-coverage-first-design.md`
- [x] User approved spec + covered-circle green state
- [ ] ADR-001, architect, staff-engineer
- [ ] Plan (EM + senior engineer)
- [ ] Implementation (draft edits exist in `src/lib/rides.ts` and `src/features/app/home-driver-coverage.tsx`; they will be revised to match the spec)
- [ ] QA + security
- [ ] PR

## Blockers
- Local Node is 20 (project pins 24). `npm run test:auth` may not run locally; it runs in CI.
