import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import {
  account,
  addChild,
  closeAction,
  expectToast,
  family,
  invitation,
  joinInvitation,
  openAction,
  openAndCheck,
  password as browserPassword,
  refresh,
  visit,
} from "../tests/auth/helpers.mjs";

// The browser adult plans the ride whose handoffs are confirmed. A driver's
// pickup step opens an hour before pickup, so that ride starts soon, in a
// timezone whose clock is nowhere near midnight (tests/auth/handoffs.spec.mjs).
const zone = new Date().getUTCHours() >= 20 ? "Asia/Tokyo" : "UTC";
function soonRide() {
  const local = (minutes) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date(Date.now() + minutes * 60_000))
        .map((part) => [part.type, part.value]),
    );
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      time: `${parts.hour}:${parts.minute}`,
    };
  };
  const pickup = local(45);
  return { date: pickup.date, pickup: pickup.time, dropoff: local(75).time };
}
// The native adult plans a ride two days out, on the phone's own calendar. No
// driver step can run out of time there: every driver request closes at pickup.
function laterDate() {
  const day = new Date();
  day.setDate(day.getDate() + 2);
  const pad = (value) => String(value).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}
const button = (scope, name) =>
  scope.getByRole("button", { name, exact: true });
const nextStep = (page) =>
  page.getByRole("region", { name: "Your next step", exact: true });
const driverCard = (page) =>
  page
    .getByRole("main")
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: "Driver", exact: true }) })
    .last();
// One child's row in the Trip card.
const journey = (page, name) =>
  page.getByRole("article", { name, exact: true });

// UI writes use Maestro/Playwright. This public-key client only observes saved state.
export async function nativeJourneys({ device, run, directory }) {
  const email = `pool-ios-${crypto.randomUUID()}@example.test`,
    password = "Pool-native-browser-2026!";
  const observer = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } },
  );
  let sequence = 0;
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // A control in a page: flow() waits for it and scrolls it to the middle of
  // the screen, clear of the top bar and the floating tab bar, before the tap.
  const tap = (text) => ({ tapOn: { text: escape(text) } });
  // A tap with no scrolling first. For the fixed top bar and tab bar, for
  // anything in a bottom sheet or picker (a scroll gesture there can spin the
  // time wheel), and for a card's own button at the top of a long page
  // (centering it would scroll it out of reach).
  const direct = new WeakSet();
  const press = (target) => {
    const command =
      typeof target === "string" ? tap(target) : { tapOn: target };
    direct.add(command);
    return command;
  };
  const reach = (command) => [
    { extendedWaitUntil: { visible: command.tapOn, timeout: 30000 } },
    {
      scrollUntilVisible: {
        element: command.tapOn,
        direction: "DOWN",
        timeout: 20000,
        centerElement: true,
      },
    },
    command,
  ];
  // Waits for something another adult's action or a reload brings in. Data
  // refreshes by itself every 20 seconds (src/services/live.ts).
  const see = (visible, timeout = 30000) => ({
    extendedWaitUntil: { visible, timeout },
  });
  // A toast confirms a finished action for four seconds; its button is named
  // "<message>. Dismiss" (src/ui/toast.tsx). Maestro can take longer than that
  // to read the screen, so a missed toast only warns: each one is followed by
  // an assertion on what the action left behind.
  const toast = (message) => ({
    assertVisible: { text: `${escape(message)}\\. Dismiss`, optional: true },
  });
  // testID is "field-<name>" (src/ui/elements.tsx, Field).
  const fieldNames = {
    "Email address": "email",
    Password: "password",
    "Your name": "display_name",
    "Family name": "name",
    "Circle name": "name",
    // A child's name, in the "Add a child" and "Edit <name>" sheets.
    Name: "display_name",
    "Car name": "label",
    "Their email": "email",
    From: "pickup_summary",
    To: "destination_summary",
  };
  const typed = (field, value, secret) => [
    { eraseText: 200 },
    { inputText: value },
    ...(secret
      ? []
      : [{ assertVisible: { ...field, text: escape(value) } }]),
    { pressKey: "enter" },
  ];
  const input = (label, value, sheet = false) => {
    if (!fieldNames[label]) throw new Error(`Unknown field: ${label}`);
    const field = { id: `field-${fieldNames[label]}` };
    return [
      sheet ? press(field) : { tapOn: field },
      ...typed(field, value, label === "Password"),
    ];
  };
  // "Pickup address" and "Drop-off address" have no name, so no testID
  // (rides/new/ride-route-fields.tsx). The field is the second element that
  // carries the label's text, after the label itself.
  const inputUnnamed = (label, value) => [
    { tapOn: { text: escape(label), index: 1 } },
    ...typed({}, value, false),
  ];
  // Nobody types a date or a time on a phone. The field opens a sheet with the
  // system picker, and "Done" accepts the value it shows: the date already in
  // the field, or the next quarter hour (src/ui/date-control.tsx).
  const acceptPicker = (name) => [
    { tapOn: { id: `field-${name}` } },
    press("Done"),
  ];
  // A ride's rare actions sit behind "More" (src/features/app/disclosure.tsx).
  // It stays open while the ride is on screen, so it is tapped only when closed.
  const expandMore = {
    runFlow: {
      when: { notVisible: { text: "Use a different car" } },
      commands: reach(tap("More")),
    },
  };
  const signInWith = (email, password) => [
    ...input("Email address", email),
    ...input("Password", password),
    { tapOn: { text: "^Sign in$" } },
    { tapOn: { text: "^Not Now$", optional: true } },
  ];
  function flow(commands) {
    const path = join(directory, `journey-${++sequence}.yaml`);
    const visibleCommands = commands.flatMap((command) =>
      typeof command === "object" && command.openLink
        ? [command, { tapOn: { text: "^Open$", optional: true } }]
        : typeof command === "object" &&
            command.tapOn &&
            !command.tapOn.optional &&
            !direct.has(command)
          ? reach(command)
          : [command],
    );
    writeFileSync(
      path,
      `appId: dev.pool.prototype\n---\n${JSON.stringify(visibleCommands, null, 2)}\n`,
    );
    run("maestro", ["--device", device, "test", path]);
  }
  function open(path) {
    return { openLink: `pool://${path}` };
  }
  // There is no "Refresh current data" anymore. Leaving the ride and opening
  // it again starts it at the top, and pulling down reloads it straight away.
  const freshRide = (path, title) => [
    open("/app/attention"),
    open(path),
    see(escape(title)),
    { swipe: { start: "50%, 30%", end: "50%, 75%" } },
  ];
  async function mailLink() {
    for (let i = 0; i < 60; i++) {
      const { messages } = await fetch(
        "http://localhost:55324/api/v1/messages?limit=100",
      ).then((r) => r.json());
      const mail = messages.find((m) =>
        m.To.some((to) => to.Address === email),
      );
      if (mail) {
        const message = await fetch(
          `http://localhost:55324/api/v1/message/${mail.ID}`,
        ).then((r) => r.json());
        return message.HTML.match(/href="([^"]+)"/)[1].replaceAll("&amp;", "&");
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("Native confirmation email was not captured.");
  }
  // Sign-up keeps what was typed after an error and asks for explicit email
  // confirmation (src/features/auth/sign-up/page.tsx, auth-form.tsx).
  flow([
    { launchApp: { clearState: true, clearKeychain: true } },
    open("/sign-up"),
    see("Create your Pool account", 120000),
    ...input("Email address", "invalid-email"),
    ...input("Password", password),
    tap("I am at least 18 years old."),
    // Nothing has been sent yet, so the form offers nothing to send again.
    { assertNotVisible: "Send it again" },
    { assertNotVisible: "Resend confirmation email" },
    // React Native exposes iOS checkbox state as its accessibility value.
    { assertVisible: { id: "field-adult-yes", text: "checkbox, checked" } },
    tap("Create account"),
    { assertVisible: "Enter a valid email address." },
    { assertVisible: { id: "field-email", text: "invalid-email" } },
    { assertVisible: { id: "field-adult-yes", text: "checkbox, checked" } },
    ...input("Email address", email),
    tap("Create account"),
    // The form gives way to a "check your inbox" screen.
    see("Check your inbox"),
    {
      assertVisible: `Check your email at ${escape(email)} for a confirmation link\\.`,
    },
    { assertVisible: "^sign in$" },
    { assertVisible: "^reset your password$" },
    { assertNotVisible: { id: "field-email" } },
    // Sending again uses the address just typed (auth-form.tsx).
    { assertVisible: "Didn’t receive the email\\?" },
    { assertVisible: "Send it again" },
    // Going back starts a blank form: nothing typed before is kept.
    tap("Use a different email"),
    see("Create your Pool account"),
    { assertNotVisible: { id: "field-email", text: escape(email) } },
    { assertNotVisible: { id: "field-adult-yes", text: "checkbox, checked" } },
    ...input("Email address", email),
    tap("I am at least 18 years old."),
    tap("Create account"),
    // Was "Complete Password." (src/ui/elements.tsx, Form).
    { assertVisible: "Add password to continue." },
  ]);
  const link = new URL(await mailLink());
  const beforeLink = await observer.auth.signInWithPassword({
    email,
    password,
  });
  assert.equal(
    beforeLink.error?.code,
    "email_not_confirmed",
    "Signup must require explicit email confirmation.",
  );
  flow([open(link.pathname + link.search), see("Confirm your email")]);
  const beforeAcceptance = await observer.auth.signInWithPassword({
    email,
    password,
  });
  assert.equal(
    beforeAcceptance.error?.code,
    "email_not_confirmed",
    "Opening an email link must not confirm it automatically.",
  );
  // Confirmation, a used link, the first family, and a session that survives
  // signing out and in again.
  flow([
    "stopApp",
    open(link.pathname + link.search),
    see("Confirm your email"),
    tap("Confirm email"),
    see("Email confirmed. Sign in to continue."),
    open(link.pathname + link.search),
    tap("Confirm email"),
    see("This link could not be used"),
    tap("Resend confirmation email"),
    { assertVisible: "Email address" },
    tap("Back to sign in"),
    ...signInWith(email, password),
    // An account without a family lands on the welcome form, already open
    // (src/features/app/profile/page.tsx). Was "Profile" and "Create a family".
    see("Welcome to Pool"),
    { assertVisible: "Join with an invitation link" },
    ...input("Your name", "Native guardian"),
    ...input("Family name", "Native family"),
    { assertVisible: { id: "field-name", text: "Native family" } },
    tap("Create family"),
    // A created family opens by itself; there is no "Open saved membership".
    toast("Family created"),
    see("Native family"),
    { assertVisible: "Guardians" },
    // The floating tab bar and the top bar (src/ui/shell.tsx).
    press("Today"),
    // Was the slogan heading. "Today" is also the tab's own name.
    see("Nothing needs you right now."),
    { assertVisible: "No rides today" },
    press("Pool home"),
    // Home no longer has a "Your family" card (src/features/app/page.tsx).
    see("Your circles"),
    // The avatar opens the Account sheet, which holds Sign out.
    press("Account"),
    press("Sign out"),
    see("You’re signed out."),
    ...signInWith(email, password),
    see("Your circles"),
    // Was "Menu": the setup links moved into the Account sheet.
    press("Account"),
    press("My family"),
    see("Native family"),
    { assertVisible: "Guardians" },
  ]);
  const signed = await observer.auth.signInWithPassword({ email, password });
  assert.equal(signed.error, null);
  const ownFamily = (
    await observer
      .from("families")
      .select("id")
      .eq("name", "Native family")
      .single()
  ).data.id;
  // The session survives a restart. Children, a car and a circle are set up
  // from My family (src/features/app/families/).
  flow([
    "stopApp",
    "launchApp",
    // The old children address still leads to My family.
    open(`/app/children?family=${ownFamily}`),
    see("Native family"),
    // Was the "Add your car" panel with "Skip": the Cars card now waits, empty.
    see("Add the car you usually drive so you can offer to drive."),
    // Children come before the car, and the edit happens while this is the
    // page's only row: every row's button is named "Edit".
    press("Add a child"),
    ...input("Name", "Native sibling", true),
    press("Add child"),
    toast("Native sibling added"),
    see("Native sibling"),
    press("Edit"),
    ...input("Name", "Updated native sibling", true),
    // "Seat" is a segmented choice (src/ui/segmented.tsx), not a select.
    press("Booster"),
    press("Save changes"),
    toast("Updated native sibling updated"),
    // The sheet's own field shows the name too, so wait for the saved row.
    see("Booster seat"),
    { assertVisible: "Updated native sibling" },
    press("Add a child"),
    ...input("Name", "Native child", true),
    press("Add child"),
    toast("Native child added"),
    see("Native child"),
    tap("Add a car"),
    ...input("Car name", "Native van", true),
    // "Seats for passengers" offers 1 to 7 and starts on 4.
    press("3"),
    press("Add car"),
    toast("Native van added"),
    see("3 passenger seats"),
    { assertVisible: "Native van" },
    {
      assertNotVisible:
        "Add the car you usually drive so you can offer to drive.",
    },
    tap("Create a circle"),
    ...input("Circle name", "Native circle", true),
    press("Create circle"),
    // The new circle opens in place of the family page.
    toast("Circle created"),
    see("Native circle"),
    {
      assertVisible:
        "It’s only your family so far. Invite another family to start sharing rides.",
    },
  ]);
  const circle = (
    await observer
      .from("circles")
      .select("id")
      .eq("name", "Native circle")
      .single()
  ).data.id;
  const nativeChildren = await observer
    .from("children")
    .select("id,display_name,seat_requirement")
    .eq("family_id", ownFamily)
    .order("display_name");
  assert.ifError(nativeChildren.error);
  assert.deepEqual(
    nativeChildren.data.map(({ display_name, seat_requirement }) => ({
      display_name,
      seat_requirement,
    })),
    [
      { display_name: "Native child", seat_requirement: "standard" },
      { display_name: "Updated native sibling", seat_requirement: "booster" },
    ],
  );
  const nativeChild = nativeChildren.data[0].id;
  const browser = await chromium.launch();
  const configuredBrowser = {
    newContext: (options) =>
      browser.newContext({
        baseURL: "http://localhost:3100",
        timezoneId: zone,
        ...options,
      }),
  };
  const web = await account(configuredBrowser, "native-counterpart");
  try {
    await family(web.page, "Web family", "Web guardian");
    const conflictingInvite = new URL(
      await invitation(web.page, email, "guardian"),
    );
    await closeAction(web.page, "Invite a guardian");
    // An adult with a family cannot join another one
    // (src/features/app/invitations/accept-form.tsx, src/lib/membership.ts).
    flow([
      open(conflictingInvite.pathname + conflictingInvite.hash),
      // A complete link is checked as it arrives: no "Check invitation".
      see("Join family: Web family"),
      // The account has a name already, so "Your name" is not asked, and
      // pressing "Join <name>" is the acceptance: there is no checkbox.
      { assertNotVisible: { id: "field-display_name" } },
      tap("Join Web family"),
      see(
        "You already belong to a family, so this invitation hasn’t been used\\..*",
      ),
      { assertVisible: "My family" },
      // Nothing was joined: the invitation is still on screen.
      { assertVisible: "Join family: Web family" },
    ]);
    // No booster or child seat on either ride, so no driver has one to confirm.
    await addChild(web.page, "Web child", "standard");
    await visit(web.page, "/app/vehicles");
    const car = await openAction(web.page, "Add a car");
    await car.getByLabel("Car name", { exact: true }).fill("Web van");
    await car
      .getByRole("radiogroup", { name: "Seats for passengers", exact: true })
      .getByRole("radio", { name: "3", exact: true })
      .click();
    await button(car, "Add car").click();
    await expectToast(web.page, "Web van added");
    // The organizer invites another family (src/features/app/circles/,
    // membership-form.tsx).
    flow([
      open(`/app/circles/${circle}`),
      see("Native circle"),
      press("Invite a family"),
      ...input("Their email", web.email, true),
      press("Create invitation"),
      see(
        `Send this link yourself\\. Only ${escape(web.email)} can use it, and it works for 7 days\\.`,
      ),
      press("Copy invitation link"),
      see("Copied"),
    ]);
    const invite = run("xcrun", ["simctl", "pbpaste", device], {
      encoding: "utf8",
      stdio: "pipe",
    }).trim();
    await openAndCheck(web.page, invite);
    // An adult who owns a family joins with it; nothing else is asked.
    await joinInvitation(web.page, "Native circle");
    await expectToast(web.page, "You joined Native circle");
    const webFamily = (
      await observer.rpc("circle_roster", { p_circle_id: circle })
    ).data.find((member) => member.family_name === "Web family").family_id;
    // Planning on the phone (src/features/app/rides/new/, ride-form.tsx). The
    // date comes from the link, the way Schedule's "Plan a ride" passes it, and
    // the pickers' own values are accepted: the wheel is never spun. The phone's
    // timezone is used, so the ride is in two days at about this time.
    const rideDate = laterDate();
    const rideDay = new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${rideDate}T00:00:00Z`));
    const rideTitle = "Native pickup area → Shared activity";
    flow([
      open(`/app/rides/new?date=${rideDate}`),
      ...acceptPicker("date"),
      { assertVisible: { id: "field-date", text: `.*${escape(rideDay)}.*` } },
      { assertVisible: { id: "field-starts_time", text: "Not set" } },
      ...acceptPicker("starts_time"),
      { assertNotVisible: { id: "field-starts_time", text: "Not set" } },
      // Drop-off follows pickup by half an hour until someone sets it.
      { assertNotVisible: { id: "field-ends_time", text: "Not set" } },
      // Was "Pickup summary" and "Drop-off summary".
      ...input("From", "Native pickup area"),
      ...input("To", "Shared activity"),
      // Was "Exact pickup" and "Exact drop-off", always on screen.
      tap("Add exact addresses"),
      ...inputUnnamed("Pickup address", "101 Native pickup"),
      ...inputUnnamed("Drop-off address", "202 Shared destination"),
      // With two children, neither starts chosen.
      { tapOn: { id: `field-child_ids-${nativeChild}` } },
      {
        assertVisible: {
          id: `field-child_ids-${nativeChild}`,
          text: "checkbox, checked",
        },
      },
      // Every other family in the circle starts invited: nothing to tap.
      {
        assertVisible: {
          id: `field-invited_family_ids-${webFamily}`,
          text: "checkbox, checked",
        },
      },
      tap("Create ride"),
      // The new ride opens by itself; there is no "Open saved result".
      toast("Ride created"),
      see(escape(rideTitle)),
      // A family that has not answered does not hold up a driver: the ride
      // names it and offers the driver actions straight away
      // (src/features/app/rides/[id]/page.tsx).
      {
        assertVisible: "No one is driving yet · Web family hasn’t replied yet",
      },
      { assertVisible: "No driver yet" },
      { assertVisible: "Ask someone else" },
    ]);
    const ride = (
      await observer
        .from("rides")
        .select("id")
        .eq("family_id", ownFamily)
        .single()
    ).data.id;
    const ridePath = `/app/rides/${ride}`;
    await visit(web.page, ridePath);
    // A family's only child starts chosen.
    await expect(
      nextStep(web.page).getByLabel("Web child", { exact: true }),
    ).toBeChecked();
    await button(nextStep(web.page), "Join ride").click();
    await expectToast(web.page, "You’re in");
    await web.page.getByText("101 Native pickup", { exact: true }).waitFor();
    // Asking is for someone else: an adult is never in their own list. So the
    // browser adult asks, and the native adult answers on the phone. Nobody
    // approves anything: the ride is set as soon as the driver says yes.
    await refresh(web.page);
    const ask = await openAction(web.page, "Ask someone else");
    await ask
      .getByText("Native guardian would drive the Native van.", { exact: true })
      .waitFor();
    await ask
      .getByText("The ride is set as soon as Native says yes.", { exact: true })
      .waitFor();
    await button(ask, "Ask Native to drive").click();
    await expectToast(web.page, "Request sent");
    // The driver's own yes, then a different car (rides/[id]/page.tsx,
    // driver-panel.tsx, ride-vehicles.tsx). The whole car is offered, the yes
    // covers the ride at once, and a car change is one step: the families see
    // the new car and approve nothing.
    flow([
      ...freshRide(ridePath, rideTitle),
      see("Can you drive this ride\\?"),
      { assertVisible: "2 riders in your Native van." },
      tap("Yes, I’ll drive"),
      toast("You’re driving"),
      // The badge and the Driver card both say so.
      see("You’re driving"),
      { assertNotVisible: "Can you drive this ride\\?" },
      expandMore,
      tap("Use a different car"),
      see(
        "You don’t have another car with a seat for every rider. Add one to switch.",
      ),
      press("Add another car"),
      // The old journey typed 3 seats here too; 4, the default, also fits.
      ...input("Car name", "Native alternate", true),
      press("Add car"),
      { assertVisible: "The families on this ride will see the new car." },
      // The car just added is the one offered.
      press("Use the Native alternate"),
      toast("Car changed"),
      see("Native alternate"),
      { assertVisible: "You’re driving" },
      { assertNotVisible: "You asked to switch.*" },
    ]);
    // The other family is shown the new car and asked nothing.
    await refresh(web.page);
    await expect(driverCard(web.page)).toContainText(
      "Native guardian is driving",
    );
    await expect(driverCard(web.page)).toContainText("Native alternate");
    await expect(nextStep(web.page)).toHaveCount(0);
    // And back again, in one step. Was a request the driver could cancel
    // while every family approved it.
    flow([
      ...freshRide(ridePath, rideTitle),
      see("Native alternate"),
      { assertVisible: "You’re driving" },
      expandMore,
      tap("Use a different car"),
      press("Use the Native van"),
      toast("Car changed"),
      see("Native van"),
      { assertNotVisible: "You asked to switch.*" },
      { assertVisible: "You’re driving" },
    ]);
    await refresh(web.page);
    await expect(driverCard(web.page)).toContainText("Native van");
    // The native driver asks the browser adult to take over, from the Driver
    // card (replacement-panel.tsx). No deadline or checkbox: the request stays
    // open until pickup, and the swap needs only the new driver's yes.
    flow([
      ...freshRide(ridePath, rideTitle),
      see("You’re driving"),
      tap("Ask someone to take over"),
      see("Web guardian would drive the Web van."),
      {
        assertVisible:
          "You keep driving until Web says yes. Then every family on the ride is told.",
      },
      press("Ask Web to drive"),
      toast("Request sent"),
      see("Web guardian was asked to take over"),
      { assertVisible: "You keep driving until Web says yes." },
    ]);
    await refresh(web.page);
    await nextStep(web.page)
      .getByRole("heading", { name: "Can you take over driving?", exact: true })
      .waitFor();
    await button(nextStep(web.page), "Yes, I’ll drive").click();
    await expectToast(web.page, "You’re driving");
    await expect(driverCard(web.page)).toContainText("You’re driving");
    // The yes was the swap, so the phone only shows the result.
    flow([
      ...freshRide(ridePath, rideTitle),
      see("Web guardian is driving"),
      { assertVisible: "Web van" },
      { assertVisible: "Covered" },
    ]);
    // Handoffs happen on a second ride that starts within the hour. The phone's
    // time picker offers the next quarter hour, which can be a minute away, and
    // every driver request closes at pickup. So the browser adult plans this
    // one, 45 minutes out, and the phone joins it.
    const soon = soonRide();
    const soonTitle = "Soon pickup area → Soon activity";
    await visit(web.page, `/app/rides/new?date=${soon.date}`);
    for (const [label, value] of [
      ["From", "Soon pickup area"],
      ["To", "Soon activity"],
      ["Pickup", soon.pickup],
      ["Drop-off", soon.dropoff],
    ])
      await web.page.getByLabel(label, { exact: true }).fill(value);
    await expect(
      web.page.getByLabel("Web child", { exact: true }),
    ).toBeChecked();
    await expect(
      web.page.getByLabel("Native family", { exact: true }),
    ).toBeChecked();
    await button(web.page, "Create ride").click();
    await expectToast(web.page, "Ride created");
    await expect(web.page).toHaveURL(/\/app\/rides\/[a-f0-9-]{36}$/);
    const soonPath = new URL(web.page.url()).pathname;
    // The browser adult offers to drive before the other family has answered,
    // and is the driver at once.
    const offer = await openAction(web.page, "I’ll drive");
    await offer
      .getByText("You’ll drive the Web van.", { exact: true })
      .waitFor();
    await button(offer, "I’ll drive").click();
    await expectToast(web.page, "You’re driving");
    // The invited family answers on the phone. It sees who is driving before
    // it joins, and joining late keeps the driver: nobody approves anyone.
    flow([
      open(soonPath),
      see(escape(soonTitle)),
      see("Are your children joining this ride\\?"),
      { assertVisible: "Invited" },
      { assertVisible: "Web is driving the Web van." },
      { tapOn: { id: `field-child_ids-${nativeChild}` } },
      {
        assertVisible: {
          id: `field-child_ids-${nativeChild}`,
          text: "checkbox, checked",
        },
      },
      tap("Join ride"),
      toast("You’re in"),
      see("Web guardian is driving"),
      { assertVisible: "Covered" },
      // Joining named this guardian to meet their child
      // (src/services/meet-riders.ts, src/features/app/handoff-panel.tsx).
      see("Who meets Native child\\?"),
      { assertVisible: "You" },
    ]);
    await refresh(web.page);
    for (const name of ["Native child", "Web child"]) {
      await button(journey(web.page, name), `Picked up ${name}`).click();
      await journey(web.page, name)
        .getByText("Picked up", { exact: true })
        .waitFor();
    }
    for (const name of ["Native child", "Web child"]) {
      await button(journey(web.page, name), `Arrived with ${name}`).click();
      await journey(web.page, name)
        .getByText("Arrived", { exact: true })
        .waitFor();
    }
    // Pressing the step is the confirmation: there is no checkbox. Was
    // "Confirm handoff as guardian" and "Handoff completed".
    flow([
      ...freshRide(soonPath, soonTitle),
      see("I have Native child"),
      tap("I have Native child"),
      toast("Handed off"),
      see("Handed off"),
      // The ride is not complete while another child waits.
      { assertVisible: "Waiting for Web guardian to confirm the handoff" },
      { assertVisible: "Dropping off" },
    ]);
    await refresh(web.page);
    await button(journey(web.page, "Web child"), "I have Web child").click();
    await web.page
      .getByText("Every child was handed off.", { exact: true })
      .waitFor();
    flow([
      "stopApp",
      "launchApp",
      open(soonPath),
      // Was "Ride completed — every child’s handoff is confirmed."
      see("Every child was handed off."),
      { assertVisible: "Completed" },
      { assertVisible: "Web guardian drove" },
      { takeScreenshot: "pool-ios-completed" },
    ]);
    const invitee = await account(configuredBrowser, "native-invitee");
    try {
      await visit(web.page, `/app/families/${webFamily}`);
      const guardianLink = await invitation(web.page, invitee.email, "guardian");
      // Signing out, a link that survives sign-in, and an invitation pasted on
      // the sign-in screen (src/features/auth/sign-in/).
      flow([
        press("Account"),
        press("Sign out"),
        see("You’re signed out."),
        open(soonPath),
        ...signInWith(email, password),
        see("Every child was handed off."),
        press("Account"),
        press("Sign out"),
        see("You’re signed out."),
        tap("Have an invitation link?"),
        { tapOn: { id: "field-invitation_link" } },
        { setClipboard: guardianLink },
        "pasteText",
        { pressKey: "enter" },
        tap("Use invitation link"),
        ...signInWith(invitee.email, browserPassword),
        // The remembered link is checked as soon as the adult is signed in.
        see("Join family: Web family"),
        ...input("Your name", "Native invitee"),
        tap("Join Web family"),
        toast("You joined Web family"),
        see("Web family"),
        { assertVisible: "Guardians" },
      ]);
    } finally {
      await invitee.context.close();
    }
    console.log(
      "Native/browser journey passed: signup, confirmation, persisted session, membership, planning, driver acceptance with no approvals, one-step car changes, optional replacement and per-child handoff receipts.",
    );
  } finally {
    await web.context.close();
    await browser.close();
    await observer.auth.signOut();
  }
}
