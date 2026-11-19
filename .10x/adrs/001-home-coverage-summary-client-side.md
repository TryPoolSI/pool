# ADR-001: Home coverage summary is derived client-side from existing RPCs

**Status:** Accepted
**Date:** 2026-11-18
**Feature:** home-coverage-first
**Author:** 10x-Team (Architect + Staff Engineer)

## Context
Home needs a first-viewport summary: how many joined rides in the next 7 days lack a confirmed driver, and how many rides are waiting on the viewer (driver replies, consents, receipts). The data already exists. `ride_offers`, `driver_statuses` and `drive_offer_details` feed Home coverage today, and `driver_inbox` and `trip_attention` feed Attention. Privacy rules (RLS and minimal projections) must not change. The journey tests lock the `Driver coverage` region contract.

## Decision
Extend the existing `loadDriverCoverage` query in `home-driver-coverage.tsx` (one TanStack query, key `["account", userId, "home-driver-coverage"]`):
- Count joined rides per circle (to tell "covered" apart from "no rides").
- Run `driver_inbox(p_pending_only)` and `trip_attention` in parallel and count distinct ride IDs. Cap the display at 25+, matching Attention's page size.
- If the waiting-count calls fail, return `null` and do not throw, so the summary degrades but coverage still renders.

`HomeDriverCoverage` renders the summary panel and the `Driver coverage` region from that single query result. No new RPC, view or migration.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| New `home_summary` RPC returning counts | One round trip; server-side counting | New migration and grant review; release ordering; duplicates Attention logic | Not worth a migration for counts the client already has |
| Reuse Attention's `loadAttention` on Home | Single source for "waiting" | Loads 366 days of offers plus a featured status; much heavier than Home needs | Overfetch on the most-visited screen |
| Separate query for the summary | Independent loading | Two loading states and possible disagreement between summary and list | Summary and list must agree |

## Consequences
### Positive
- Summary and list always agree, since they come from one result.
- No backend change; ships as a client-only PR.

### Negative
- Two more RPC calls on Home load (both small and limited to 26 rows).
- "Waiting" counting logic is near Attention's but not shared. It could drift.

### Risks
- If Attention's definition of "waiting" changes, Home's count may differ. Mitigation: the comment in `loadWaiting` points to Attention, and the copy links to Today's rides for the authoritative list.

## Dependencies
- Existing RPCs `driver_inbox` and `trip_attention` (grants unchanged).
- It constrains a future "Home as ledger" redesign to keep one query per surface.
