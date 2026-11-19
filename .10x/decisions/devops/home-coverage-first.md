# DevOps: home-coverage-first
- **Delivery:** a single PR from `claude/home-coverage-first` into protected `main`. CI `checks` (web: `npm run check` + `test:auth`; ios: components + native smoke) must be green.
- **Deploy:** the normal serialized release after merge (Vercel builds `main` only). No migration, so no release-ordering constraint.
- **Rollback:** revert the PR merge commit. It's client-only with no data change.
