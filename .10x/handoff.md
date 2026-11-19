# Handoff

**From:** SDE → **To:** QA + Security

- What was built and the deviations: `.10x/decisions/sde/home-coverage-first.md`.
- To test: the Home summary states (amber, green, waiting null/0/n), the coverage region in loading, error and empty states, Ride cards at 320/390/800/1280, the offer form focus round trip, and the covered-circle green state.
- To review: the new RPC reads (`driver_inbox`, `trip_attention`) on Home, and the shared `CommandForm` render change.
