# ADR-002: CommandForm supports a secondary submit; PageHeading drops `eyebrow`

**Status:** Accepted
**Date:** 2026-11-18
**Feature:** sitewide-home-patterns
**Author:** 10x-Team (Architect + Staff Engineer)

## Context
Every `CommandForm` submit renders as primary (`Button type="submit"` → primary). On pages with several forms, such as ride detail, that gives several equal-weight primaries and no single next step. `PageHeading` also exposes an `eyebrow` prop that the design system now bans (Impeccable craft floor; DESIGN.md "One Headline").

## Decision
- Add an optional `secondary?: boolean` prop to `CommandForm`. When set, its submit renders as a secondary button: same name, role and behavior, different emphasis only.
- `Button` honors an explicit `className="secondary"` override even when `type="submit"`.
- Remove the `eyebrow` prop from `PageHeading` and the `eyebrow` style class. Callers lose the prop, which is a compile-time break caught by `tsc`.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Make all submits secondary and opt in to primary | Forces deliberate emphasis | Touches every form; huge visual diff | Too broad for this PR |
| Restyle per page with `style` overrides | No API change | Scattered one-offs; breaks the className-only convention | Violates the staff-engineer convention |

## Consequences
- **Positive:** pages can express one primary action. Eyebrows can't creep back in.
- **Negative:** another prop on a shared component.
- **Risks:** a secondary submit could be mistaken for less important when it's required. Mitigation: use it only where another primary exists in the same view.
