# DevOps: index

## Delivery
- `.github/workflows/ci.yml`: `web` (npm run check + test:auth on Ubuntu), `ios` (macOS components + native build/smoke), and `checks` as the required aggregate.
- `delivery.yml` / `release.yml`: serialized release, migrations then Vercel production. Vercel deploys only `main` (`vercel.json` ignoreCommand).
- Protected main. All changes land through PRs.
