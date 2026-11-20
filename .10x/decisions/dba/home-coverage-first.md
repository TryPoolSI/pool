# DBA: home-coverage-first
- No schema, migration, index or grant change.
- New reads on Home: `driver_inbox(p_pending_only=true, p_limit=26)` and `trip_attention(p_limit=26)`. Both already exist, are already used by Attention, and are bounded.
