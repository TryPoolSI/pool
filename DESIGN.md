---
name: Pool
description: Share the driving. One design language for iOS and web, drawn from the Pool car logo.
colors:
  canvas: "#F2F8FB"
  surface: "#FFFFFF"
  tint: "#E6F2F8"
  cream: "#FBF1DE"
  ink: "#14294A"
  muted: "#55657F"
  line: "#D8E5ED"
  outline: "#7D93A8"
  sky: "#2BBDE6"
  sky-pressed: "#17A5D1"
  blue: "#0A6F9A"
  sky-wash: "#E3F5FB"
  sun: "#F5C01E"
  sun-ink: "#7A4A00"
  sun-wash: "#FFF4CF"
  coral: "#F06656"
  coral-ink: "#A62B1C"
  coral-wash: "#FFEDEA"
  avatar-sky: "#CDEEFA"
  avatar-sky-ink: "#0A5578"
  avatar-sun: "#FFE7A3"
  avatar-sun-ink: "#6B4300"
  avatar-coral: "#FFD8D2"
  avatar-coral-ink: "#8A2A1E"
  glass: "#FFFFFFB8"
  scrim: "#14294A5C"
  focus: "#14294A"
typography:
  brand:
    fontFamily: "Manrope, sans-serif"
    fontSize: "32px"
    fontWeight: 800
    lineHeight: "38px"
    letterSpacing: "-1.4px"
  headline:
    fontFamily: "Manrope, sans-serif"
    fontSize: "32px"
    fontWeight: 800
    lineHeight: "38px"
    letterSpacing: "-0.9px"
  headline-phone:
    fontFamily: "Manrope, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: "34px"
    letterSpacing: "-0.7px"
  title:
    fontFamily: "Manrope, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: "26px"
    letterSpacing: "-0.3px"
  title-small:
    fontFamily: "Manrope, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: "24px"
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  body-small:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  button:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "22px"
  field-label:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "20px"
  badge:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: "18px"
  caption:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
rounded:
  sm: "8px"
  md: "14px"
  lg: "20px"
  xl: "28px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
  xxxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.sky}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "48px"
  button-danger:
    backgroundColor: "{colors.coral-wash}"
    textColor: "{colors.coral-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    height: "48px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.blue}"
    typography: "{typography.button}"
    height: "48px"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    height: "48px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "20px"
  sheet:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
  status-badge-neutral:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.muted}"
    typography: "{typography.badge}"
    rounded: "{rounded.full}"
    padding: "3px 10px 3px 8px"
  status-badge-set:
    backgroundColor: "{colors.sky-wash}"
    textColor: "{colors.blue}"
    typography: "{typography.badge}"
    rounded: "{rounded.full}"
  status-badge-act:
    backgroundColor: "{colors.sun}"
    textColor: "{colors.ink}"
    typography: "{typography.badge}"
    rounded: "{rounded.full}"
  status-badge-open:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.sun-ink}"
    typography: "{typography.badge}"
    rounded: "{rounded.full}"
  status-badge-waiting:
    backgroundColor: "{colors.tint}"
    textColor: "{colors.muted}"
    typography: "{typography.badge}"
    rounded: "{rounded.full}"
  tab-bar:
    backgroundColor: "{colors.glass}"
    rounded: "{rounded.full}"
    height: "64px"
---

# Design system: Pool

Read this before changing any screen. It is the contract for every person and agent who touches Pool's interface. Tokens live in `src/ui/styles.ts`; shared components live in `src/ui/` and `src/features/app/presentation.tsx`. If a screen needs something this document does not cover, add it here and to the shared layer first, then use it.

## The idea: the logo is the system

The Pool logo is a soft sky-blue car carrying three passengers (two coral, one yellow) behind a cream window, on navy wheels. Every visual decision comes from it.

| Logo part | Token | Job in the interface |
|---|---|---|
| Car body | `sky`, `blue`, `skyWash` | The main action, links, selection, and "settled" |
| Yellow passenger and spark lines | `sun`, `sunInk`, `sunWash` | Someone has to act |
| Coral passengers | `coral`, `coralInk`, `coralWash` | Something failed, or a destructive action |
| Wheels | `ink` | All text and icons |
| Window | `cream` | Warm fill for icon discs and empty states |
| Soft rounded clay shapes | `radius`, `shadow.card` | Large radii, soft lift, no hard edges |

The app should feel like the logo: friendly, rounded, calm, and quick to read on a phone between errands.

## Color

All colors come from `colors` in `src/ui/styles.ts`. A feature file never contains a hex value.

**Surfaces**
- `canvas` is the page behind everything.
- `surface` (white) is every card, field, sheet and secondary button.
- `tint` is quiet chrome: the desktop sidebar, neutral badges, date tiles, the close button, segmented-control tracks.
- `cream` fills icon discs and empty-state symbols. It never carries text smaller than an icon.

**Text and lines**
- `ink` for all primary text and icons. `muted` for secondary text, captions and inactive navigation.
- `line` for 1px dividers and card borders. `outline` for field and checkbox borders, so inputs read as interactive.

**The three signals**
- **Sky means settled or go.** `sky` fills the primary button, the selected day, checked boxes and the plan button. `blue` is the text version: links, the current tab, settled badges. `skyWash` backs selected rows and settled notices.
- **Sun means someone has to act.** Solid `sun` with `ink` text is reserved for "this is your move" badges. `sunWash` with `sunInk` text is for attention notices and task icons, and a `sun` outline marks an open slot (a ride with no driver).
- **Coral means a failure or a destructive action.** `coralWash` with `coralInk` for error messages and danger buttons.

No other hue may carry ride or task state. Avatars rotate through sky, sun and coral tints (the three passengers) for differentiation only; avatar color never means state.

**Contrast.** Measured pairs: `ink` on `sky` 6.7:1, `blue` on `surface` 5.6:1, `blue` on `skyWash` 5.0:1, `sunInk` on `sunWash` 6.7:1, `coralInk` on `coralWash` 6.2:1, `muted` on `surface` 5.9:1. Primary buttons use `ink` text on `sky`; white text on `sky` fails (2.2:1) and is not allowed. State is never shown by color alone: every badge has a text label.

## Typography

Two bundled variable fonts (`public/fonts/`): **Manrope** for headings and the wordmark, **DM Sans** for everything else.

| Style | Font | Size / line | Weight | Use |
|---|---|---|---|---|
| Headline | Manrope | 32/38 (28/34 on phone) | 800 | One per screen: the page title |
| Title | Manrope | 20/26 | 700 | Card and sheet titles |
| Title small | Manrope | 17/24 | 700 | Sections inside a card, form groups |
| Body | DM Sans | 16/24 | 400 | Default text, field text |
| Body small | DM Sans | 14/20 | 400 | Supporting lines, hints |
| Button | DM Sans | 16/22 | 600 | Buttons and links |
| Field label | DM Sans | 14/20 | 600 | Labels above fields |
| Badge | DM Sans | 13/18 | 700 | Status badges |
| Caption | DM Sans | 12/16 | 400 | The smallest text allowed |

Each screen has exactly one Headline. Nothing is set below 12px. Field text stays at 16px so iOS does not zoom on focus. Uppercase eyebrows are not used.

## Spacing, shape and depth

- **Spacing** runs on a 4px base: 4, 8, 12, 16, 20, 24, 32 (`spacing.xs` to `spacing.xxxl`). Cards sit 12px apart. Form fields sit 16px apart. Page content is inset 16px on a phone, 24px to 1200px, 40px beyond.
- **Radius** has four steps and a pill: `sm` 8 (checkboxes, number chips), `md` 14 (buttons, fields, tiles, notices), `lg` 20 (cards), `xl` 28 (sheets and dialogs), `full` (badges, avatars, the tab bar). Pick the step by the size of the thing.
- **Depth** has two levels. Cards have a 1px `line` border and `shadow.card`, a soft lift like the clay logo. Floating chrome uses `shadow.float`. Nothing else has a shadow.
- **Touch targets** are 48px tall for buttons and fields, and never under 44px for anything tappable.

## Liquid Glass

Glass is for the navigation layer that floats over content. It is the `Glass` component in `src/ui/glass.tsx`: real Liquid Glass (`expo-glass-effect`) on iOS 26 and later, a backdrop blur on web, and a near-opaque white surface elsewhere.

Glass is used in four places only:
1. The phone tab bar (a floating capsule).
2. The round "Plan a ride" button beside it, tinted `sky`.
3. The phone top bar.
4. Toasts.

Content never sits on glass: cards, forms, sheets and lists stay opaque so text keeps its contrast. Glass is never stacked on glass.

## Layout

- **Phone (650px and under).** A glass top bar holds the wordmark (or a back button on detail screens) and the account avatar. Content scrolls underneath. A floating glass tab bar holds Home, Today, Schedule and Driving; the round plan button sits beside it. Setup destinations (My family, Vehicles, Invitations, Profile) and Sign out live in the Account sheet behind the avatar.
- **Wider screens.** A `tint` sidebar holds the wordmark, a primary "Plan a ride" button, the four destinations, the setup destinations and the account row. There is no top bar.
- Content is capped at 1120px. Forms are capped at 640px. Lists become two columns above 900px.
- Breakpoints: 650, 900, 1200. Layout must reflow at 320px without horizontal scroll.

## Components

Use these. Do not build a second version of any of them.

### Buttons (`UI.Button`, `Link className="button …"`)
One shape, four emphases:
- **Primary** (`sky` fill, `ink` text): the single main commitment on a view. A view has at most one. `type="submit"` is primary by default.
- **Secondary** (white, `line` border): every other action.
- **Danger** (`coralWash`, `coralInk`): cancel a ride, remove a person, withdraw.
- **Quiet** (text only, `blue`): low-emphasis actions next to a primary.

A form's submit button spans the column on a phone. Buttons show a spinner and "Saving…" while busy, dim to 72% while pressed, and to 50% when disabled. Labels are a verb and an object in two or three words ("Create ride", "Add child", "Change riders"). Never "Submit", "OK" or "Open saved result".

### Links (`Link`)
`blue`, weight 600, 44px tall. `className="text-link"` adds a trailing icon. Use a link to go somewhere and a button to do something.

### Status badges (`StatusBadge`)
A pill with an icon and **one to three short words**. A badge is never a sentence and never wraps. If the state needs explaining, the explanation goes in a line of body text under the title, in plain words that say who has to do what ("Waiting for Cam to say yes").

A ride badge answers one question: **whose move is it?** Each answer has its own fill, outline and icon, so two different states never look alike and colour is never the only cue.

| Tone | Means | Look | Labels |
|---|---|---|---|
| `act` | You have to do something | Solid `sun`, `ink` text, arrow | "Invited", "Your reply", "Confirm handoff", "Pick up", "Drop off", "Who meets" |
| `open` | The ride has no driver; anyone can take it | `surface` with a `sun` outline, `sunInk` text, car | "Needs driver" |
| `waiting` | Someone else has to answer | `tint`, `muted` text, clock | "Asked Cam", "Dropping off" |
| `set` | Settled | `skyWash`, `blue` text, check | "Covered", "You’re driving", "On the way" |
| `neutral` | Over or off | `tint`, `muted` text, grey dot | "Completed", "Cancelled", "Not riding" |

Rules:
- Never use a bare "Pending". A waiting badge names who is being waited for ("Asked Cam"), and the line under the title says what for.
- Solid sun is only for the viewer's own move. If the viewer can do nothing, the badge is `open`, `waiting` or `set`.
- Outside rides (invitation lists, handoff rows) the older `attention`, `positive` and `neutral` tones remain.

A ride's badge and its one-line explanation always come from `rideSummary()` in `src/lib/ride-state.ts`. Never write a second label map: the same ride must read the same on Home, Today, the Schedule and its own page.

### Ride cards (`RideCard`, `RideList`)
The one ride card: when, where, a badge, and a line saying who has to do what. The whole card opens the ride. If this person can act on it in one tap, that action sits in a row under the card.

### Cards (`UI.Section`, class `panel`)
White, `radius.lg`, 20px padding (16px on phone), hairline plus `shadow.card`. One fact cluster per card. A card that is a link to a detail screen is tappable as a whole.

### Notices (class `notice`, `role="status"`, `role="alert"`)
`radius.md`, no border. Sky wash for information, sun wash for attention, coral wash for errors. One or two sentences.

### Fields (`UI.Label` with `UI.Field`, `UI.Select`, `UI.Choice`)
- Every field has a visible label above it. Placeholders are examples, never labels.
- **Text**: only when the answer is free text (a name, a place).
- **Choice** (`UI.Choice`, the segmented control): two to four short, exclusive options ("Outbound / Return", seat types).
- **Select**: five or more options, or long option labels. Native sheet on iOS, system select on web.
- **Date and time** (`UI.Field type="date" | "time"`): nobody types a date. A field-shaped button opens the system picker.
- **Checkbox rows** (`UI.Label className="checkbox-label"`): multi-select lists (riders, families). The whole row is the target; a selected row turns `skyWash` with a `sky` border.
- A number that is small and bounded (seats) uses a stepper or a segmented control, not a keyboard.

### Sheets (`ActionDialog`)
The only overlay. A bottom sheet on a phone, a centered dialog from 651px. It has a title, a round close button, and a scrim that closes it when tapped. There is no "Done" footer. A sheet closes itself when the task inside it succeeds.

### Toasts (`useToast`)
A glass pill near the bottom of the screen (above the phone tab bar) with a sky check and a few words ("Ride created", "Child added"). It appears when an action succeeded **and** the surface that held the form has gone (a sheet closed, or the app navigated). It lasts four seconds and can be dismissed by tapping. One at a time.

### Empty states (`EmptyState`)
A 56px cream disc with an icon, a short title, one sentence, and a primary button for the obvious next step.

### Avatars and icon discs
40px circles. Avatars show initials on a passenger tint. Icon discs are `cream` with an `ink` icon. Icons are the line set in `src/ui/icon.tsx` (24px grid, 1.7 stroke). No emoji as icons.

## Interaction patterns

These rules matter more than any color.

### Forms
1. **Ask only what Pool cannot work out.** Timezone comes from the device. Drop-off is on the pickup date. Direction defaults to outbound. A family with one child has that child preselected. Technical values (revisions, versions, ids, UTC, IANA names) never appear in the interface.
2. **Sensible defaults, easy controls.** Prefer a tap to typing. Preselect the common answer.
3. **Short forms.** A simple task is one group of fields and one button. Optional detail hides behind a `Disclosure`.
4. **A date chosen earlier is never asked again.** Planning from a day in the Schedule carries that date into the form.

### Completing an action
1. The button shows it is working ("Saving…" and a spinner). The form is disabled until the answer arrives.
2. **On success the person goes back to their task without another tap.** A created thing opens (creating a ride lands on that ride). A sheet closes. The list behind it already shows the change. A toast confirms.
3. If the form stays on screen after success, the confirmation is shown inline next to the button, and no toast is shown. One confirmation per action.
4. **On failure the input stays.** The error appears next to the button in a coral notice, says what happened in plain words and what to do next. Never clear a form because a save failed.

### The next action
- Each screen and each ride card leads with what **this person** has to do, as a primary button with a verb ("I’ll drive", "Join ride", "Picked up everyone").
- What other people still have to do is a muted line of text that names them ("Waiting for Cam to say yes"), never a button.
- One primary button per view. Rare and destructive actions sit behind a `Disclosure` or a danger button at the bottom.

### Ask for a yes only where it is someone's own decision
Three things need a yes, each from the one person it belongs to, each in one tap:
- a family putting its own children on a ride ("Join ride"),
- an adult agreeing to drive ("I’ll drive", "Yes, I’ll drive"),
- a guardian confirming they have their child at drop-off ("I have Leo").

Everything else is **announced, not approved**: who is driving and in which car, a change of driver or car, a family joining or leaving after a driver is set. The ride changes at once, and the families on it are told in "What changed" on Home (`RideUpdates`) and on the ride itself.

- Never add a step where one family approves another family's decision, and never make a ride wait for a family that has not answered. An unanswered invitation supplies no riders and blocks nothing.
- A change someone might not want has an exit instead of a gate: a family can take its own children off a ride ("Change riders") any time before the first pickup; a driver can stop driving; a pending request can be cancelled.
- The sheet that makes a change says in one sentence what happens next and who is told ("You’re the driver as soon as you tap. The families on this ride are told.").
- The only automatic refusal is physical: a late join that the driver's car has no seat for is declined with what to do about it.

### Calendar
- The Schedule opens on the seven days starting today, as a strip. A day is a button: tapping it selects it and shows that day's rides underneath. The selected day is filled `sky`; today is outlined in `blue`.
- Each day carries one dot (sun when a ride that day still needs someone, sky when every ride is settled), so the week reads without opening a ride.
- Arrows move seven days at a time; "Today" returns. "Plan a ride" on a selected day carries the date into the form.
- Anything that looks like a day you can tap must do something when tapped.

### Staying current
- Shared data refreshes by itself: when the app returns to the foreground and every 20 seconds while visible (`src/services/live.ts`). Pull-to-refresh exists on iOS as a habit, not a need. There is no "Refresh" button.
- A refresh never clears what is on screen or a draft in a form.
- A notice about someone else's change says what changed and whether this person must act.
- Changes other people made to a ride you are on appear under "What changed" on Home for three days: one line each, naming the person or family, linking to the ride. Pool sends no push notifications or email about rides yet; this list is the announcement.

### Setup without dead ends
- If a task needs something that does not exist yet (a child, a vehicle), offer to add it right there in a sheet and return to the task with it selected. Do not send the person to another screen.
- Explain "family" and "circle" the first time they appear, in one line each: a **family** is the adults and children in your household; a **circle** is the group of families you share rides with.

### Motion
- Sheets slide up (phone) or fade (wider). Toasts appear without travel. Press feedback is a 120ms opacity change.
- Motion explains where something came from; it is never decoration. Reduced-motion settings turn it off.

## Language

Voice: a calm, capable friend. Plain, direct, short.

- **Say who and what.** "Alex is driving" beats "Driver confirmed". "Tuesday's outbound ride needs a driver" beats "Coverage incomplete".
- **Lead with the person's action.** "Add a child to plan a ride", not "Children must be registered before planning".
- **Sentence case** everywhere, including buttons and titles. No exclamation marks.
- **No system words**: revision, version, proposal, nomination, snapshot, command, IANA, UTC, id. Say "driver request", "plan", "time".
- **One name per thing**: ride, rider, driver, family, circle, guardian, pickup, drop-off. Use "drop-off", never "destination", in the interface. The Today tab is "Today".
- **Errors** say what happened and the next step: "That didn't go through. Your entries are still here, so check your connection and try again."
- **Times** are written the way people say them ("Tue, Nov 24 · 7:40 – 8:10 AM", from `rideWhen()` in `src/lib/rides.ts`). The UTC offset appears only when a ride's timezone differs from the device's.
- **Numbers agree**: "1 ride needs a driver", "3 rides need a driver".
- Buttons: verb plus object. Badges: one to three short words. Helper text: one sentence.

## Accessibility

- WCAG 2.1 AA. Text contrast at least 4.5:1; field borders at least 3:1.
- Every tappable thing is at least 44px and has a role and an accessible name. Icon-only buttons have a label.
- Focus is a 3px `ink` outline with 3px offset on web. Sheets trap focus, close on Escape and return focus to the trigger.
- Success and error messages are announced (`role="status"`, `role="alert"`).
- Layout reflows at 320px. Dynamic type must not clip text: avoid fixed heights on text containers.

## Where things live

| Need | Use | File |
|---|---|---|
| Colors, spacing, radius, shadows, text styles, layout classes | `colors`, `spacing`, `radius`, `shadow`, `styles`, class names | `src/ui/styles.ts` |
| Text, cards, fields, buttons, segmented choice, loading | `UI.*` (`Heading1`, `Section`, `Label`, `Field`, `Select`, `Choice`, `Button`, `Loading`) | `src/ui/elements.tsx` |
| A form that runs an action | `CommandForm`. `after` decides what success does: `"open"` (go to the created thing), `"close"` (close the sheet), `"toast"`, `"inline"`. `tone="danger"` for destructive submits. `compact` for a lone one-tap button | `src/ui/command-form.tsx` |
| An overlay | `ActionDialog`. `tone` styles the trigger; `compact` makes it a text action for list rows; `trigger` takes custom content | `src/features/app/action-dialog.tsx` |
| A confirmation after the surface closed | `useToast()` | `src/ui/toast.tsx` |
| Floating navigation surfaces | `Glass` | `src/ui/glass.tsx` |
| Page title, badge, avatar, empty state, optional detail | `PageHeading`, `StatusBadge`, `Avatar`, `EmptyState`, `Disclosure` | `src/features/app/presentation.tsx` |
| A ride in a list | `RideCard`, `RideList` | `src/features/app/ride-list.tsx` |
| A ride's badge and "who does what" line | `rideSummary()` | `src/lib/ride-state.ts` |
| Ride times | `rideWhen()`, `rideClockRange()`, `rideTime()` | `src/lib/rides.ts` |
| Offering to drive | `HomeDriverOffer` | `src/features/app/home-driver-offer.tsx` |
| Telling families what changed on their rides | `RideUpdates` (RPC `ride_updates`) | `src/features/app/ride-updates.tsx` |
| Who meets a child by default | `meetOwnRiders()` | `src/services/meet-riders.ts` |
| Adding a child or car without leaving the task | `AddChildSheet`, `AddVehicleForm` | `src/features/app/ride-form.tsx`, `driver-form.tsx` |
| Keeping data current | `useLiveData()` (mounted once in the shell) | `src/services/live.ts` |

## Checklist before shipping a screen

- [ ] Only tokens from `src/ui/styles.ts`; no hex, radius or font size written in the feature file.
- [ ] One Headline, at most one primary button.
- [ ] Every badge is one to three short words, and its tone matches whose move it is.
- [ ] No step asks one family to approve another's decision; changes are announced.
- [ ] Each field passes "could Pool have known this?" and uses the lightest control that fits.
- [ ] Success returns the person to their task; failure keeps their input.
- [ ] The person's own next action is first and is a button; other people's actions are text.
- [ ] No system words in any string.
- [ ] Works at 390px and 1280px; nothing hides behind the tab bar.
