# CTO: index

## Tech stack
- One Expo 58 / Expo Router / React Native 0.88 codebase for responsive web (React Native Web) and iOS.
- Supabase: Auth, Postgres, RLS, and security-definer RPC commands. TanStack Query for client cache.
- Web runs as an Expo export served by a Node container (`scripts/serve.mjs`) and deploys via Vercel from `main` only.
- Node 24.x is pinned in `.nvmrc` and `engines`.

## Direction
- Privacy and explicit consent are product invariants enforced in the database, not the UI (see PRODUCT.md).
- No maps/GPS/push/recurrence/offline writes by design.

## Active features
- home-coverage-first: Home redesign from the 2026-11-18 Impeccable critique.
