# SRE: home-coverage-first
- **Load:** Home adds 2 bounded RPC calls (`driver_inbox`, `trip_attention`, ≤26 rows each) in parallel with the existing coverage query.
- **Failure isolation:** a waiting-count failure degrades only the summary copy, and coverage still renders (ADR-001). A coverage failure shows the existing alert and retry.
- **Monitoring:** no new alerts needed. `/api/health` is unchanged (liveness only).
- **Runbook:** if Home shows "Driver coverage could not be loaded." widely, check the Supabase RPC availability of `ride_offers`, `driver_statuses` and `drive_offer_details`, the same as before this change.
