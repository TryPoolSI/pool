# Architect: index

## Structure
- `src/app/**`: Expo Router route files (thin) that delegate to `src/features/**/page.tsx` screens.
- `src/features/app/**`: screen and panel components. They load data with `createScreen` / `createPanel` (`src/ui/remote.tsx`) or TanStack `useQuery`.
- `src/services/**`: command actions (`*-actions.ts`) that call Supabase RPCs, plus session, cache and active family.
- `src/lib/**`: pure domain helpers (rides/time, drivers, membership) and the Supabase client and generated types.
- `src/ui/**`: the cross-platform element layer (`elements.tsx` wraps RN primitives with a className → style mapper in `styles.ts`), the shell and platform shims (`*.web.ts`).
- Data flow: screens read via RPC views (`ride_offers`, `driver_statuses`, `drive_offer_details`, `driver_inbox`, `trip_attention`). Writes go through `CommandForm` → service action → RPC with request IDs and revisions. There are no direct table writes.

## Active features
- home-coverage-first: see `home-coverage-first.md`.
