# Handoff

**From:** DevOps + SRE → **To:** Reviewer / merger

- PR from `claude/home-coverage-first`. Merge only after CI `checks` is green (`test:auth` was not run locally).
- Rollback: revert the merge commit (client-only).
- Runbook: `.10x/decisions/sre/home-coverage-first.md`.
