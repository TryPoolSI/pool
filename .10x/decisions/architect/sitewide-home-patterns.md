# Architect: sitewide-home-patterns
- Components touched: `presentation.tsx` (PageHeading, StatusBadge, RouteSummary, EmptyState), `ride-list.tsx`, `attention/page.tsx`, `schedule/page.tsx` (if nested), `rides/[id]/page.tsx`, `driver-panel.tsx`, `ui/command-form.tsx`, `ui/elements.tsx` (Button), `ui/styles.ts`.
- No data or RPC changes. ADR-002 covers the CommandForm/PageHeading API change.
- Failure modes: none new. These are pure presentation changes.
