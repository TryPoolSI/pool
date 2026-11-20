---
name: Pool
description: Share the driving. A calm, explicit record of who is driving whom.
colors:
  ledger-green: "#255741"
  spring-lime: "#dfe9bd"
  harvest-amber: "#785016"
  harvest-amber-wash: "#faf0d8"
  brick-error: "#952c22"
  brick-error-wash: "#fff1ee"
  brick-error-rule: "#ad4035"
  pine-ink: "#253c35"
  lichen-muted: "#5b6c64"
  field-outline: "#718477"
  hairline-sage: "#dce2d9"
  meadow-wash: "#edf3e8"
  sage-mist: "#f0f2ea"
  morning-paper: "#f6f7f2"
  surface-white: "#ffffff"
  avatar-sage: "#e0e9d3"
  avatar-sage-ink: "#354e31"
  avatar-rose: "#f2dcd1"
  avatar-rose-ink: "#6d4639"
  avatar-blue: "#dce6ec"
  avatar-blue-ink: "#375262"
  focus-blue: "#537dce"
  scrim-pine: "#152e2566"
typography:
  brand:
    fontFamily: "Manrope, sans-serif"
    fontSize: "37px"
    fontWeight: 800
    lineHeight: "42px"
    letterSpacing: "-2px"
  headline:
    fontFamily: "Manrope, sans-serif"
    fontSize: "36px"
    fontWeight: 700
    lineHeight: "45px"
    letterSpacing: "-1.3px"
  headline-compact:
    fontFamily: "Manrope, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: "36px"
    letterSpacing: "-0.9px"
  status-figure:
    fontFamily: "Manrope, sans-serif"
    fontSize: "36px"
    fontWeight: 700
    lineHeight: "44px"
    letterSpacing: "-1px"
  title:
    fontFamily: "Manrope, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: "30px"
    letterSpacing: "-0.55px"
  title-small:
    fontFamily: "Manrope, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: "24px"
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "23px"
  body-small:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "20px"
  field:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "23px"
  label:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "21px"
  field-label:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: "20px"
  eyebrow:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: "18px"
    letterSpacing: "1.1px"
  badge:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: "19px"
rounded:
  check: "4px"
  alert: "6px"
  field: "8px"
  button: "9px"
  tile: "10px"
  card: "12px"
  panel: "15px"
  dialog: "18px"
  pill: "20px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ledger-green}"
    textColor: "{colors.surface-white}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "10px 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.pine-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "10px 16px"
    height: "44px"
  button-icon:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.pine-ink}"
    rounded: "{rounded.button}"
    size: "44px"
  text-link:
    textColor: "{colors.ledger-green}"
    typography: "{typography.label}"
    height: "44px"
  input-field:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.pine-ink}"
    typography: "{typography.field}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
    height: "46px"
  panel:
    backgroundColor: "{colors.surface-white}"
    rounded: "{rounded.panel}"
    padding: "24px"
  notice:
    backgroundColor: "{colors.meadow-wash}"
    textColor: "{colors.ledger-green}"
    rounded: "{rounded.card}"
    padding: "16px"
  alert-error:
    backgroundColor: "{colors.brick-error-wash}"
    textColor: "{colors.brick-error}"
    rounded: "{rounded.alert}"
    padding: "12px 16px"
  status-badge-neutral:
    backgroundColor: "{colors.sage-mist}"
    textColor: "{colors.lichen-muted}"
    typography: "{typography.badge}"
    rounded: "{rounded.pill}"
    padding: "4px 9px"
  status-badge-positive:
    backgroundColor: "{colors.meadow-wash}"
    textColor: "{colors.ledger-green}"
    typography: "{typography.badge}"
    rounded: "{rounded.pill}"
    padding: "4px 9px"
  status-badge-attention:
    backgroundColor: "{colors.harvest-amber-wash}"
    textColor: "{colors.harvest-amber}"
    typography: "{typography.badge}"
    rounded: "{rounded.pill}"
    padding: "4px 9px"
  icon-disc:
    backgroundColor: "{colors.spring-lime}"
    textColor: "{colors.pine-ink}"
    rounded: "{rounded.full}"
    size: "36px"
  task-icon:
    backgroundColor: "{colors.harvest-amber-wash}"
    textColor: "{colors.harvest-amber}"
    rounded: "11px"
    size: "42px"
  week-day:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.pine-ink}"
    rounded: "{rounded.card}"
    padding: "15px 4px"
  week-day-today:
    backgroundColor: "{colors.ledger-green}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.card}"
    padding: "15px 4px"
  dialog:
    backgroundColor: "{colors.surface-white}"
    rounded: "{rounded.dialog}"
    width: "600px"
---

# Design System: Pool

## Overview

**Creative North Star: "The Carpool Ledger"**

Pool should read like a well-kept family ledger: every ride, driver, consent and handoff is written down plainly, and you can tell at a glance what's settled and what isn't. The palette is a soft sage paper world (Morning Paper canvas, Sage Mist sidebar, white panels on hairline borders) with one deep, trustworthy Ledger Green for primary actions and "covered" states. Harvest Amber is the only color that asks for attention, so an uncovered ride or a pending task stands out without raising alarm.

Components are friendly and tactile. Panels are generously rounded and padded, controls have a full 44px touch target, and lime icon discs and colored avatar initials add warmth without decoration. Density is moderate. It's an operational app read on a phone between errands, so each card carries one fact cluster, and the multi-column grid only appears once there's room for it.

The system is flat. Depth comes from tonal layering (paper → mist → white) and 1px hairlines, never shadows. The UI is set in two typefaces: Manrope for tight, confident headings and DM Sans for calm, readable body text.

**Key Characteristics:**
- Sage-paper neutrals with a single deep green accent and a single amber attention color.
- Flat surfaces separated by 1px Hairline Sage borders; no shadows anywhere.
- Generously rounded containers (15px panels, 18px dialogs) and pill status badges.
- Manrope headings with negative tracking; DM Sans body at 15/23.
- 44px minimum controls, persistent phone tab bar, desktop sidebar.

## Colors

Low-chroma sage neutrals carry nearly every pixel. One green and one amber carry all of the meaning.

### Primary
- **Ledger Green** (`ledger-green`): Primary buttons, current navigation item (icon + label), text links, "today" in the week strip, positive/covered notices and badges, focus-adjacent brand moments like the sidebar sign-off and skip link text. It means *settled* or *go*.

### Secondary
- **Spring Lime** (`spring-lime`): Warm accent fill for 36px icon discs (circle shield, team icons), the 48px empty-state symbol, inline number chips, and the 2px rail on activity timelines. It is a background, never text.

### Tertiary
- **Harvest Amber** (`harvest-amber`) on **Harvest Amber Wash** (`harvest-amber-wash`): Attention. Used for uncovered rides, pending tasks, task icons, attention badges, and the large status figure on ride overviews ("Needs a driver"). Amber marks a state that someone has to act on.

### Error
- **Brick Error** (`brick-error`) on **Brick Error Wash** (`brick-error-wash`) with a 3px **Brick Error Rule** (`brick-error-rule`) left border: Form and command failures only.

### Neutral
- **Pine Ink** (`pine-ink`): All primary text and default icon color.
- **Lichen Muted** (`lichen-muted`): Secondary text, paragraphs, eyebrows, inactive nav, ride times, captions.
- **Field Outline** (`field-outline`): Input borders and candidate-driver cards, darker than hairlines so fields read as interactive.
- **Hairline Sage** (`hairline-sage`): Every 1px divider and container border: panels, buttons, list rows, top bar, sidebar edge, card footers.
- **Meadow Wash** (`meadow-wash`): Soft green tint for notices, status messages, checkbox rows, driver summaries, feature-detail columns.
- **Sage Mist** (`sage-mist`): Desktop sidebar background and neutral badges.
- **Morning Paper** (`morning-paper`): App and auth canvas behind everything.
- **Surface White** (`surface-white`): Panels, cards, buttons, fields, dialogs, phone tab bar.
- **Avatar tints** (`avatar-sage`, `avatar-rose`, `avatar-blue` with matching inks): Initial avatars for people and families, rotated for differentiation only.
- **Focus Blue** (`focus-blue`): The 3px focus-visible outline. It's deliberately outside the palette so it can never be confused with state.
- **Scrim Pine** (`scrim-pine`): The 40%-alpha pine overlay behind dialogs.

### Named Rules
**The Two Signals Rule.** Green means settled, amber means someone must act. No other hue may carry ride or task state.

**The Paper Stack Rule.** Surfaces layer as Morning Paper → Sage Mist → Surface White. A new surface uses one of these three, never a fourth tint.

## Typography

**Display Font:** Manrope (with sans-serif)
**Body Font:** DM Sans (with sans-serif)

**Character:** Manrope's tight, slightly geometric headings give the ledger its confident page titles. DM Sans keeps long lists of names, times and states easy to scan. Both are bundled locally as variable fonts (`public/fonts/`).

### Hierarchy
- **Brand** (800, 37px/42px, -2px): The "Pool" wordmark beside the car logo in the sidebar and auth card. The footer uses a 24px/800 lowercase "pool." variant.
- **Headline** (700, 36px/45px, -1.3px): One page title per screen. It drops to **Headline Compact** (28px/36px phone, 30px/39px tablet, -0.9px) at ≤1200px, and to 27–29px/37px inside the auth card.
- **Status Figure** (Manrope 700, 36px/44px, -1px, Harvest Amber): The single big state word on a ride overview.
- **Title** (700, 22px/30px, -0.55px): Panel and dialog headings.
- **Title Small** (700, 17px/24px): Subsections within a panel.
- **Body** (400, 15px/23px): Default text. Paragraphs use Lichen Muted.
- **Body Small** (400, 13px/20px): Captions, meta facts, section captions.
- **Field** (400, 16px/23px): Input text. Kept at 16px so iOS doesn't zoom on focus.
- **Label** (600, 14px/21px): Button text and text links.
- **Field Label** (600, 13px/20px): Form labels above fields.
- **Eyebrow** (700, 12px/18px, 1.1px tracking, UPPERCASE, Lichen Muted): The kicker above a page title ("SHARE THE DRIVING").
- **Badge** (700, 12px/19px): Status pills.

### Named Rules
**The One Headline Rule.** Each screen gets exactly one Headline, with an optional Eyebrow above it. Everything below it is Title or smaller.

## Layout

- **Shell:** On desktop/tablet (>650px), a left sidebar in Sage Mist (190px up to 900px, 205px up to 1200px, 232px beyond) holds the brand, the current circle card, primary destinations, setup destinations, a sign-off line and "Plan a ride". A top bar (76px desktop, 64px phone) sits over the content with a hairline bottom border. On phones (≤650px) the sidebar is replaced by a persistent bottom tab bar (52px tabs, icon over a 12px label) on Surface White, inside safe areas.
- **Content column:** Max width 1352px, centered. Horizontal inset is 16px on phone, 24px up to 1200px, and 40px beyond. Top padding is 24px on phone and 36px on desktop. Forms cap at 760px and the ride planner at 900px.
- **Grids:** Dashboard, people, setup and ride lists turn into a two-up wrapping grid (≈47% basis, 20px gap) only above 900px. Below that everything stacks to full width. Paired form fields go side by side above 650px.
- **Rhythm:** A 4px base with steps at 4, 8, 12, 16, 20 and 24px. Panels sit 16px apart vertically. List rows use 17px vertical padding with hairline separators. Page headings get 24px below them, collapsing to a stacked layout on phone.
- **Breakpoints:** 650px (phone/tablet), 900px (multi-column), 1200px (wide). Layout must still reflow at 320px.

## Elevation & Depth

Pool is entirely flat. There are no box-shadows or blur. Depth comes from the Paper Stack (Morning Paper canvas, Sage Mist chrome, white content surfaces) and 1px Hairline Sage borders. Dialogs separate from the page with the Scrim Pine overlay rather than a lifted shadow.

### Named Rules
**The Ledger Is Flat Rule.** If a surface needs to stand apart, give it a hairline border or step it up the Paper Stack. Never add a shadow.

## Shapes

Shapes are soft and friendly, and the radius grows with the size of the container: checkboxes 4px, alerts 6px, fields 8px, buttons 9px, checkbox rows 10px, cards/notices/week days 12px, panels 15px, dialogs and the auth card 18px. Status badges are 20px pills, the account trigger is a 24px pill, and avatars, icon discs and the empty symbol are full circles. Borders are always 1px, except the 2px white avatar ring, the 2px lime activity rail and the 3px error rule. Icons are a small custom line set (24px grid, 1.7 stroke, default 20px).

## Components

### Buttons
Friendly and tactile: a full 44px target, a hairline border, gently rounded corners.
- **Shape:** Gently rounded (9px). Content-width by default (`alignSelf: flex-start`), with an icon gap of 8px.
- **Primary:** Ledger Green fill and border, white Label text, 10px × 16px padding. Use one per view for the main commitment (plan, accept, confirm).
- **Secondary:** White fill, Hairline Sage border, Pine Ink Label. This is the default for everything else, including "Today's rides" and "Done".
- **Icon / Plain:** A 44×44 square with the same border. The plain variant drops the border and fill (menu, back, close in headers).
- **States:** Disabled is 60% opacity. Focus is the global 3px Focus Blue outline with 3px offset. No hover or press transforms are defined.

### Text Links
Ledger Green Label text, 44px tall, often with a 16px leading icon ("+ Plan a ride") or a trailing chevron/arrow.

### Status Badges
- **Style:** 20px pill, 4px × 9px padding, Badge type.
- **Variants:** Neutral (Sage Mist / Lichen), Positive (Meadow Wash / Ledger Green), Attention (Harvest Amber Wash / Harvest Amber).

### Cards / Containers
- **Panel:** White, 1px Hairline Sage border, 15px radius, 24px padding (16px on phone), 16px vertical margin.
- **Ride card:** A panel in a list grid (20px padding, 16px on phone). It has a 43px bordered date block, a heading with times in Lichen Muted, and a hairline-topped footer row for driver and actions pinned to the bottom.
- **Ride overview:** A split panel. The main facts are on the left and a Meadow Wash feature column on the right (hairline-divided) shows the amber Status Figure. It stacks below 900px.
- **Notice:** Meadow Wash, hairline border, 12px radius, 16px padding, Ledger Green 14px text. An attention variant swaps in the amber pair.
- **Driver summary:** Meadow Wash row, 12px radius, 16px padding.
- **Candidate:** 12px radius with a Field Outline border, for proposed drivers.

### Inputs / Fields
- **Style:** White, 1px Field Outline border, 8px radius, 10px × 12px padding, 46px min height, 16px Field type. Labels sit 8px above in Field Label type.
- **Checkbox row:** Meadow Wash tile (10px radius, 12px padding) with a 22px white checkbox (4px radius, hairline border), used for explicit consents and confirmations.
- **Native controls:** Date and select use the platform's native pickers on iOS and browser controls on web.
- **Error:** Brick Error alert block (Brick Error Wash, 3px left rule, 6px radius) above or near the form.

### Navigation
- **Sidebar items:** Plain buttons with a 20px icon and 14px label. The current item is Ledger Green with weight 700, others Lichen Muted at 400. Setup destinations sit below a hairline.
- **Phone tabs:** Equal-width, 52px tall, icon above a 12px centered label, same current-item coloring.
- **Circle card:** A hairline-bordered 12px box at the top of the sidebar with a lime shield disc, circle name and "Share the driving".

### Dialogs
A white sheet with an 18px radius and hairline border, max 600px wide and 95% tall, on the Scrim Pine overlay. The header row has a Title and a 44px close button, the body scrolls, and the footer has a right-aligned secondary "Done", with sections divided by hairlines. Focus is trapped, Escape closes it, and focus is restored on close. It fades in on native and appears instantly on web.

### Week Strip
Seven equal day tiles (white, hairline, 12px radius, 15px × 4px padding). Today is filled Ledger Green with white text. On phone the tiles tighten to 8px radius and a 4px gap.

### Avatars & Icon Discs
40px initials avatars with a 2px white ring in rotating sage/rose/blue tints. 36px Spring Lime discs hold circle and team icons. 42px amber rounded squares (11px) hold task icons.

### Empty State
Centered: a 48px Spring Lime circle symbol, a short title, then one plain sentence telling the user what to do next.

## Do's and Don'ts

### Do:
- **Do** build every new surface from the Paper Stack: Morning Paper canvas, Sage Mist chrome, white panels with 1px Hairline Sage borders.
- **Do** keep Ledger Green for primary actions, current navigation and covered/settled states, with one primary button per view.
- **Do** mark anything that needs a person's action with the Harvest Amber pair, and only that.
- **Do** use Manrope for headings (one Headline per screen) and DM Sans for everything else, with fields at 16px.
- **Do** keep every interactive element at least 44px tall and keep the 3px Focus Blue outline visible.
- **Do** stack to a single column at ≤900px and switch to the phone tab bar at ≤650px.

### Don't:
- **Don't** add box-shadows, glows or blur. Separation comes from hairlines and tonal steps (The Ledger Is Flat Rule).
- **Don't** introduce a new hue to signal ride or task state. Green and amber are the only signals, and Brick Error is only for failures.
- **Don't** use Spring Lime as text or as a button fill. It's a warm background accent only.
- **Don't** put more than one Headline on a screen or use Manrope for body copy.
