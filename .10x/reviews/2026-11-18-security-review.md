# Security review: home-coverage-first (2026-11-18)

- **Data exposure:**
  - New Home reads `driver_inbox` and `trip_attention` are existing invoker RPCs under RLS, already used by Attention for the same user.
  - Home shows only a **count** of ride IDs from them.
  - The summary's "Next:" line and the offer heading reuse `pickup_summary`/`destination_summary` that the card already shows (coarse labels by design).
  - No new child or profile data.
- **Writes:** unchanged. `offerToDrive` still goes through `CommandForm` → `driverAction` → `offer_to_drive` RPC with request ID, revision and vehicle version checks.
- **Input:** no new inputs. The seat field and restraint checkbox are unchanged.
- **Secrets:** none added. Local `.env.local` stays gitignored. The local seed script and test credentials live only in the session scratchpad, not the repo.
- **Verdict:** no security concerns. No auth, permission or RLS change.
