import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import {
  account,
  family,
  openAndCheck,
  visit,
  refresh,
} from "../tests/auth/helpers.mjs";
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
  const tap = (text) => ({ tapOn: { text: escape(text) } });
  const fieldNames = {
    "Email address": "email",
    Password: "password",
    "Family name": "name",
    "Your display name": "display_name",
    "Circle name": "name",
    "Child display name": "display_name",
    "Vehicle label": "label",
    "Passenger seats, excluding you": "passenger_seats",
    "Recipient email": "email",
    "Pickup summary": "pickup_summary",
    "Drop-off summary": "destination_summary",
    "Exact pickup": "pickup",
    "Exact drop-off": "destination",
    "IANA timezone": "timezone",
    "Pickup time": "starts_local",
    "Drop-off time": "ends_local",
    "Available passenger seats, excluding you": "available_seats",
  };
  const input = (label, value) => [
    { tapOn: { id: `field-${fieldNames[label]}` } },
    { eraseText: 200 },
    { inputText: value },
    ...(label === "Password"
      ? []
      : [
          {
            assertVisible: {
              id: `field-${fieldNames[label]}`,
              text: escape(value),
            },
          },
        ]),
    { pressKey: "enter" },
  ];
  function flow(commands) {
    const path = join(directory, `journey-${++sequence}.yaml`);
    const visibleCommands = commands.flatMap((command) =>
      typeof command === "object" && command.openLink
        ? [command, { tapOn: { text: "^Open$", optional: true } }]
        : typeof command === "object" && command.tapOn
          ? [
              {
                scrollUntilVisible: {
                  element: command.tapOn,
                  direction: "DOWN",
                  timeout: 20000,
                  centerElement: true,
                },
              },
              command,
            ]
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
  flow([
    { launchApp: { clearState: true, clearKeychain: true } },
    open("/sign-up"),
    ...input("Email address", email),
    ...input("Password", password),
    tap("I am at least 18 years old."),
    // React Native exposes iOS checkbox state as its accessibility value.
    { assertVisible: { id: "field-adult-yes", text: "checkbox, checked" } },
    tap("Create account"),
    { assertVisible: "Check your email.*" },
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
  flow([
    open(link.pathname + link.search),
    { assertVisible: "Confirm your email" },
  ]);
  const beforeAcceptance = await observer.auth.signInWithPassword({
    email,
    password,
  });
  assert.equal(
    beforeAcceptance.error?.code,
    "email_not_confirmed",
    "Opening an email link must not confirm it automatically.",
  );
  flow([
    tap("Confirm email"),
    { assertVisible: "Welcome to Pool" },
    ...input("Family name", "Native family"),
    ...input("Your display name", "Native guardian"),
    { assertVisible: { id: "field-name", text: "Native family" } },
    { assertNotVisible: "Open saved membership" },
    tap("Create family"),
    tap("Open saved membership"),
    { assertVisible: "Native family" },
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
  flow([
    "stopApp",
    "launchApp",
    open(`/app/families/${ownFamily}`),
    { assertVisible: "Native family" },
    tap("Create a circle"),
    ...input("Circle name", "Native circle"),
    tap("Create circle"),
    tap("Open saved membership"),
    open("/app/children"),
    ...input("Child display name", "Native child"),
    tap("Save child"),
    { assertVisible: "Saved.*" },
    open("/app/vehicles"),
    ...input("Vehicle label", "Native van"),
    ...input("Passenger seats, excluding you", "3"),
    tap("Save vehicle"),
    { assertVisible: "Saved.*" },
  ]);
  const circle = (
    await observer
      .from("circles")
      .select("id")
      .eq("name", "Native circle")
      .single()
  ).data.id;
  const nativeChild = (
    await observer
      .from("children")
      .select("id")
      .eq("family_id", ownFamily)
      .single()
  ).data.id;
  const browser = await chromium.launch();
  const configuredBrowser = {
    newContext: (options) =>
      browser.newContext({ baseURL: "http://localhost:3100", ...options }),
  };
  const web = await account(configuredBrowser, "native-counterpart");
  try {
    await family(web.page, "Web family", "Web guardian");
    await visit(web.page, "/app/children");
    await web.page.getByLabel("Child display name").fill("Web child");
    await web.page
      .getByRole("button", { name: "Save child", exact: true })
      .click();
    await web.page.getByRole("status").filter({ hasText: "Saved" }).waitFor();
    await visit(web.page, "/app/vehicles");
    await web.page.getByLabel("Vehicle label").fill("Web van");
    await web.page.getByLabel("Passenger seats, excluding you").fill("3");
    await web.page
      .getByRole("button", { name: "Save vehicle", exact: true })
      .click();
    await web.page.getByRole("status").filter({ hasText: "Saved" }).waitFor();
    flow([
      open(`/app/circles/${circle}`),
      tap("Invite another family"),
      ...input("Recipient email", web.email),
      tap("Create circle invitation"),
      tap("Copy invitation link"),
    ]);
    const invite = run("xcrun", ["simctl", "pbpaste", device], {
      encoding: "utf8",
      stdio: "pipe",
    });
    await openAndCheck(web.page, invite);
    await web.page.getByLabel("Your display name").fill("Web guardian");
    await web.page
      .getByLabel("Family to join the circle")
      .selectOption({ label: "Web family" });
    await web.page.getByRole("checkbox").check();
    await web.page
      .getByRole("button", { name: "Accept invitation", exact: true })
      .click();
    await web.page
      .getByRole("status")
      .filter({ hasText: "Membership accepted" })
      .waitFor();
    const webFamily = (
      await observer.rpc("circle_roster", { p_circle_id: circle })
    ).data.find((member) => member.family_name === "Web family").family_id;
    flow([
      open("/app/rides/new"),
      ...input("Pickup summary", "Native pickup area"),
      ...input("Drop-off summary", "Shared activity"),
      ...input("Exact pickup", "101 Native pickup"),
      ...input("Exact drop-off", "202 Shared destination"),
      ...input("IANA timezone", "UTC"),
      ...input("Pickup time", "2028-09-10T14:00"),
      ...input("Drop-off time", "2028-09-10T15:00"),
      { tapOn: { id: `field-child_ids-${nativeChild}` } },
      { tapOn: { id: `field-invited_family_ids-${webFamily}` } },
      tap("Create ride"),
      tap("Open saved result"),
      { assertVisible: "Native pickup area.*" },
    ]);
    const ride = (
      await observer
        .from("rides")
        .select("id")
        .eq("family_id", ownFamily)
        .single()
    ).data.id;
    const ridePath = `/app/rides/${ride}`;
    const freshRide = () => [
      open("/app/attention"),
      tap("Refresh current data"),
      open(ridePath),
    ];
    await visit(web.page, ridePath);
    await web.page.getByLabel("Web child", { exact: true }).check();
    await web.page
      .getByRole("button", { name: "Join with own riders", exact: true })
      .click();
    await web.page.getByText("101 Native pickup", { exact: true }).waitFor();
    flow([
      ...freshRide(),
      { tapOn: { id: "field-driver_vehicle" } },
      tap("Native guardian · Native van · 3 passenger seats"),
      tap(
        "I nominate this adult and vehicle for this ride’s current riders and plan.",
      ),
      tap("Nominate driver"),
      ...freshRide(),
      ...input("Available passenger seats, excluding you", "3"),
      tap(
        "I can accommodate all 0 booster seats and 0 child seats required for these riders.",
      ),
      tap(
        "I explicitly accept driving this ride with this vehicle and available passenger capacity.",
      ),
      tap("Accept as driver"),
      { tapOn: { id: `field-child_ids-${nativeChild}` } },
      tap(
        "I explicitly consent to this driver, vehicle and plan for my selected children.",
      ),
      tap("Approve driver for selected children"),
    ]);
    await refresh(web.page);
    await web.page.getByLabel("Web child", { exact: true }).check();
    await web.page
      .getByLabel(
        "I explicitly consent to this driver, vehicle and plan for my selected children.",
      )
      .check();
    await web.page
      .getByRole("button", {
        name: "Approve driver for selected children",
        exact: true,
      })
      .click();
    await web.page.getByText("Confirmed", { exact: true }).waitFor();
    // Native driver nominates a web replacement; each family provides fresh consent.
    flow([
      ...freshRide(),
      tap("Review driver change"),
      { tapOn: { id: "field-driver_vehicle" } },
      tap("Web guardian · Web van · 3 passenger seats"),
      tap(
        "I request a replacement with fresh driver acceptance and consent for every enrolled child.",
      ),
      tap("Request replacement"),
      tap("Done"),
    ]);
    await refresh(web.page);
    await web.page
      .getByLabel("Available passenger seats, excluding you")
      .fill("3");
    await web.page
      .getByLabel(
        "I can accommodate all 0 booster seats and 0 child seats required for these riders.",
      )
      .check();
    await web.page
      .getByLabel(
        "I explicitly accept driving this ride with this vehicle and available passenger capacity.",
      )
      .check();
    await web.page
      .getByRole("button", { name: "Accept as driver", exact: true })
      .click();
    flow([
      ...freshRide(),
      { tapOn: { id: `field-child_ids-${nativeChild}` } },
      tap(
        "I explicitly consent to this driver, vehicle and plan for my selected children.",
      ),
      tap("Approve driver for selected children"),
    ]);
    await refresh(web.page);
    await web.page.getByLabel("Web child", { exact: true }).check();
    await web.page
      .getByLabel(
        "I explicitly consent to this driver, vehicle and plan for my selected children.",
      )
      .check();
    await web.page
      .getByRole("button", {
        name: "Approve driver for selected children",
        exact: true,
      })
      .click();
    flow([
      ...freshRide(),
      { tapOn: { id: "field-recipient_id" } },
      tap("Native guardian (you)"),
      tap(
        "I designate this guardian to receive Native child. A guardian who drives must still explicitly confirm receipt.",
      ),
      tap("Save designated guardian"),
    ]);
    await refresh(web.page);
    const ownJourney = web.page.getByRole("article", {
      name: "Journey for Web child",
    });
    await ownJourney
      .getByLabel("Designated guardian for Web child")
      .selectOption({ label: "Web guardian (you)" });
    await ownJourney.getByRole("checkbox").check();
    await ownJourney
      .getByRole("button", { name: "Save designated guardian", exact: true })
      .click();
    for (const name of ["Native child", "Web child"])
      for (const action of ["Report pickup", "Report arrival"]) {
        await refresh(web.page);
        const journey = web.page.getByRole("article", {
          name: `Journey for ${name}`,
        });
        await journey.getByRole("checkbox").check();
        await journey
          .getByRole("button", { name: action, exact: true })
          .click();
      }
    flow([
      ...freshRide(),
      tap("I explicitly confirm that I have received Native child."),
      tap("Confirm child received"),
      { assertVisible: ".*Handoff completed.*" },
    ]);
    await refresh(web.page);
    await ownJourney
      .getByLabel("I explicitly confirm that I have received Web child.")
      .check();
    await ownJourney
      .getByRole("button", { name: "Confirm child received", exact: true })
      .click();
    await web.page
      .getByText("Ride completed — every child’s handoff is confirmed.", {
        exact: true,
      })
      .waitFor();
    flow([
      "stopApp",
      "launchApp",
      open(ridePath),
      { assertVisible: "Ride completed.*" },
      { takeScreenshot: "pool-ios-completed" },
    ]);
    console.log(
      "Native/browser journey passed: signup, confirmation, persisted session, membership, planning, independent driver acceptance/consent, optional replacement and per-child handoff receipts.",
    );
  } finally {
    await web.context.close();
    await browser.close();
    await observer.auth.signOut();
  }
}
