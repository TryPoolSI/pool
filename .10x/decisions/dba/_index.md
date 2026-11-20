# DBA: index

## Schema
- 12 versioned migrations under `supabase/migrations`. Every public table has RLS. Writes go through checked security-definer RPCs with revision checks.
- Generated types are at `src/lib/supabase/database.types.ts` (`npm run db:types`).

## Active features
- home-coverage-first: no schema change. It reads existing RPCs only.
