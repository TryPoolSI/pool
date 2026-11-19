# QA report: sitewide-home-patterns (2026-11-18)

| Check | Result |
|---|---|
| `npm run check` (Node 24.22.1) | Pass: 72/72 unit, 9/9 component, web + iOS export |
| Impeccable detector `--changed` | 0 findings |
| Runtime sweep (Home, Today, Schedule, Driving, ride detail, My family, Vehicles, circle) | 0 nested panels, 0 ride/task cards inside panels, ≤1 primary per view, 0 uppercase kickers, 0 text-node or duplicate-key warnings |
| 320px | No horizontal scroll on Today and My family |
| `test:auth` / iOS journeys | Not run locally; CI on push. The first PR #63 run (Home changes) passed web + ios |

Test-locked contracts were kept: Today's h1, "Unassigned — needs a driver", the driver-panel label text, the "Outbound · Pickup:" prefix, and child `group` names with seat text.
