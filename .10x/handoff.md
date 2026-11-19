# Handoff

**From:** Architect + Staff Engineer → **To:** EM. See ADR-001.

- The design comes from the Impeccable critique (`.impeccable/critique/*page-tsx.md`), with user decisions recorded in the spec.
- Read the spec's "Constraints" first. The journey tests in `tests/auth/home.spec.mjs` lock region, group, link and button names, the "Pickup: … GMT" format and the seat default.
- The uncommitted draft code predates discovery. It drops the GMT offset and adds a second link per row, both of which violate the constraints. Revise it before committing.
