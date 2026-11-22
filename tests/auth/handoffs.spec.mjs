import { authenticatedRpc, captureRpc, replayRpc } from "./rpc.mjs";
import {
  visit,
  refresh,
  openAction,
  account,
  addChild,
  expectToast,
  family,
  invitation,
  joinInvitation,
  openAndCheck,
} from "./helpers.mjs";
import { test, expect } from "@playwright/test";

// The planner runs on the device's clock, and the driver's pickup step opens an
// hour before pickup. So the ride starts soon, on devices whose clock is
// nowhere near midnight.
const zone = new Date().getUTCHours() >= 20 ? "Asia/Tokyo" : "UTC";
const onDevice = (browser) => ({
  newContext: (options) => browser.newContext({ ...options, timezoneId: zone }),
});
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
const button = (scope, name) =>
  scope.getByRole("button", { name, exact: true });
// The ride's state badge sits beside its title.
const badge = (page, label) =>
  page
    .getByRole("heading", { level: 1 })
    .locator("xpath=../..")
    .getByText(label, { exact: true });
const driverCard = (page) =>
  page
    .getByRole("main")
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: "Driver", exact: true }) })
    .last();
const nextStep = (page) =>
  page.getByRole("region", { name: "Your next step", exact: true });
// One child's row in the Trip card.
const journey = (page, name) =>
  page.getByRole("article", { name, exact: true });
// Every trip step is a button; pressing it is the confirmation.
const steps = /^(Picked up |Arrived with |I have |I’ll meet )/;
const rideName = "Handoff neighborhood → Handoff activity";

async function rpc(page, name, args) {
  const response = await authenticatedRpc(page, name, args);
  expect(response.ok(), name).toBe(true);
  return response.json();
}
async function join(inviter, person, circleUrl, circleName) {
  await visit(inviter.page, circleUrl);
  const link = await invitation(inviter.page, person.email, "circle");
  const familyUrl = person.page.url();
  await openAndCheck(person.page, link);
  await joinInvitation(person.page, circleName);
  await expectToast(person.page, `You joined ${circleName}`);
  await expect(person.page).toHaveURL(familyUrl);
}
// Presses one child's step from the keyboard.
async function report(page, name, label) {
  const step = button(journey(page, name), label);
  await expect(journey(page, name).getByRole("checkbox")).toHaveCount(0);
  await step.focus();
  await expect(step).toBeFocused();
  await page.keyboard.press("Enter");
}
test("R6: independent driver and guardians persist arrival and confirm each child separately with explicit receipt", async ({
  browser,
}) => {
  const a = await account(onDevice(browser), "r6-a"),
    b = await account(onDevice(browser), "r6-b"),
    d = await account(onDevice(browser), "r6-driver"),
    out = await account(onDevice(browser), "r6-outside");
  try {
    const familyA = await family(
      a.page,
      "Handoff family A",
      "Receiving guardian A",
    );
    await family(b.page, "Handoff family B", "Receiving guardian B");
    await family(d.page, "Handoff driver family", "Reporting driver");
    await family(out.page, "Handoff outside family", "Outside guardian");
    const circle = await openAction(a.page, "Create a circle");
    await circle
      .getByLabel("Circle name", { exact: true })
      .fill("Handoff circle");
    await button(circle, "Create circle").click();
    await expectToast(a.page, "Circle created");
    await expect(
      a.page.getByRole("heading", { level: 1, name: "Handoff circle" }),
    ).toBeVisible();
    const circleUrl = a.page.url();
    await join(a, b, circleUrl, "Handoff circle");
    await join(a, d, circleUrl, "Handoff circle");
    await visit(a.page, familyA);
    await addChild(a.page, "Handoff child A");
    await addChild(b.page, "Handoff child B");
    await visit(d.page, "/app/vehicles");
    const car = await openAction(d.page, "Add a car");
    await car.getByLabel("Car name", { exact: true }).fill("Handoff van");
    const seats = car
      .getByRole("radiogroup", { name: "Seats for passengers", exact: true })
      .getByRole("radio", { name: "3", exact: true });
    await seats.click();
    await expect(seats).toBeChecked();
    await button(car, "Add car").click();
    await expectToast(d.page, "Handoff van added");
    await expect(car).toHaveCount(0);

    const rideTimes = soonRide();
    await visit(a.page, `/app/rides/new?date=${rideTimes.date}`);
    for (const [label, value] of [
      ["From", "Handoff neighborhood"],
      ["To", "Handoff activity"],
      ["Pickup address", "111 Handoff pickup"],
      ["Drop-off address", "222 Handoff destination"],
      ["Pickup", rideTimes.pickup],
      ["Drop-off", rideTimes.dropoff],
    ])
      await a.page.getByLabel(label, { exact: true }).fill(value);
    await expect(
      a.page.getByLabel("Handoff child A", { exact: true }),
    ).toBeChecked();
    await expect(
      a.page.getByLabel("Handoff family B", { exact: true }),
    ).toBeChecked();
    // The driver's family has no rider on this ride.
    await a.page.getByLabel("Handoff driver family", { exact: true }).uncheck();
    await button(a.page, "Create ride").click();
    await expectToast(a.page, "Ride created");
    await expect(a.page).toHaveURL(/\/app\/rides\/[a-f0-9-]{36}$/);
    await expect(
      a.page.getByRole("heading", { name: rideName, exact: true }),
    ).toBeVisible();
    const url = a.page.url();
    const rideId = new URL(url).pathname.split("/").at(-1);
    const status = async () =>
      (await rpc(a.page, "driver_status", { p_ride_id: rideId }))[0];
    await visit(b.page, url);
    await expect(
      nextStep(b.page).getByLabel("Handoff child B", { exact: true }),
    ).toBeChecked();
    await button(nextStep(b.page), "Join ride").click();
    await expectToast(b.page, "You’re in");
    await expect(
      b.page.getByText("111 Handoff pickup", { exact: true }),
    ).toBeVisible();
    await refresh(a.page);
    // Putting a child on the ride named that guardian to meet them at
    // drop-off, so nothing about the handoff waits for a driver.
    await expect(
      a.page.getByText("The trip starts once a driver is confirmed.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      journey(a.page, "Handoff child A").getByText("You", { exact: true }),
    ).toBeVisible();
    await expect(
      journey(a.page, "Handoff child B").getByText("Receiving guardian B", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      a.page.getByText(/to say who meets/, { exact: false }),
    ).toHaveCount(0);
    const ask = await openAction(a.page, "Ask someone else");
    await expect(
      ask.getByText("Reporting driver would drive the Handoff van.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      ask.getByText("The ride is set as soon as Reporting says yes.", {
        exact: true,
      }),
    ).toBeVisible();
    await button(ask, "Ask Reporting to drive").click();
    await expectToast(a.page, "Request sent");
    await expect(ask).toHaveCount(0);
    await expect(badge(a.page, "Asked Reporting")).toBeVisible();
    await expect(
      a.page.getByText("Waiting for Reporting to say yes", { exact: true }),
    ).toBeVisible();
    expect((await status()).coverage).toBe("awaiting_confirmation");
    // The driver's yes sets the ride. No family approves anything.
    await visit(d.page, url);
    await nextStep(d.page)
      .getByLabel("I have 2 boosters", { exact: true })
      .check();
    await button(nextStep(d.page), "Yes, I’ll drive").click();
    await expectToast(d.page, "You’re driving");
    await expect(driverCard(d.page)).toContainText("You’re driving");
    await expect(nextStep(d.page)).toHaveCount(0);
    expect((await status()).coverage).toBe("confirmed");
    for (const [p, name] of [
      [a, "Handoff child A"],
      [b, "Handoff child B"],
    ]) {
      await refresh(p.page);
      await expect(badge(p.page, "Covered")).toBeVisible();
      await expect(nextStep(p.page)).toHaveCount(0);
      await expect(p.page.getByRole("button", { name: /Approve/ })).toHaveCount(
        0,
      );
      const row = journey(p.page, name);
      await expect(
        row.getByText(`Who meets ${name}?`, { exact: true }),
      ).toBeVisible();
      await expect(row.getByText("You", { exact: true })).toBeVisible();
      await expect(row.getByText("Waiting", { exact: true })).toBeVisible();
      // A family with one guardian has nobody else to choose.
      await expect(p.page.getByRole("button", { name: steps })).toHaveCount(0);
      // Riders can still change while the pickup is ahead.
      await expect(button(p.page, "Change riders")).toBeVisible();
    }
    // The ride can still be cancelled before the first pickup.
    await expect(button(a.page, "Cancel ride")).toBeVisible();
    await refresh(d.page);
    await expect(badge(d.page, "You’re driving")).toBeVisible();
    await d.page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        d.page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      )
      .toBe(true);
    // The driver sees who meets each child, and that the first pickup locks the ride.
    for (const suffix of ["A", "B"])
      await expect(
        journey(d.page, `Handoff child ${suffix}`).getByText(
          `Receiving guardian ${suffix}`,
          { exact: true },
        ),
      ).toBeVisible();
    await expect(
      d.page.getByText("After the first pickup, the ride can’t be changed.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      button(journey(d.page, "Handoff child A"), "Picked up Handoff child A"),
    ).toBeVisible();
    await expect(button(d.page, "Picked up everyone")).toBeVisible();
    // Until the first pickup the driver can still step back, under "More".
    if ((await button(d.page, "More").getAttribute("aria-expanded")) !== "true")
      await button(d.page, "More").click();
    await expect(button(d.page, "Stop driving this ride")).toBeVisible();
    // Today leads with the same step for the driver.
    await visit(d.page, "/app/attention");
    const driverToday = d.page.getByRole("region", {
      name: "Needs you",
      exact: true,
    });
    // Today lists the children in the order their handoffs are stored.
    await expect(
      driverToday.getByRole("link", {
        name: new RegExp(
          `^${rideName}, .*, Pick up\\. Time to pick up Handoff child (A and Handoff child B|B and Handoff child A)\\. After the first pickup, the ride can’t be changed\\.$`,
        ),
      }),
    ).toBeVisible();
    await expect(button(driverToday, "Picked up everyone")).toBeVisible();
    await visit(d.page, url);
    // Only the driver can confirm a pickup.
    await refresh(a.page);
    await expect(
      a.page.getByText(
        "After Reporting’s first pickup, the ride can’t be changed.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(a.page.getByRole("button", { name: steps })).toHaveCount(0);
    await expect(button(a.page, "Picked up everyone")).toHaveCount(0);
    await report(d.page, "Handoff child A", "Picked up Handoff child A");
    await expectToast(d.page, "Pickup confirmed");
    await expect(
      journey(d.page, "Handoff child A").getByText("Picked up", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      journey(d.page, "Handoff child A").getByRole("heading"),
    ).toBeFocused();
    // The first pickup locks the ride: the driver cannot step back anymore.
    await expect(badge(d.page, "On the way")).toBeVisible();
    await expect(button(d.page, "More")).toHaveCount(0);
    await expect(button(d.page, "Stop driving this ride")).toHaveCount(0);
    await expect(
      journey(d.page, "Handoff child B").getByText("Waiting", {
        exact: true,
      }),
    ).toBeVisible();
    await report(d.page, "Handoff child B", "Picked up Handoff child B");
    await expect(
      journey(d.page, "Handoff child B").getByText("Picked up", {
        exact: true,
      }),
    ).toBeVisible();
    // With everyone in the car, Today names the driver's next move.
    await visit(d.page, "/app/attention");
    await expect(
      driverToday.getByRole("link", {
        name: new RegExp(
          `^${rideName}, .*, Drop off\\. Confirm arrival for Handoff child (A and Handoff child B|B and Handoff child A)$`,
        ),
      }),
    ).toBeVisible();
    await expect(button(driverToday, "Arrived with everyone")).toBeVisible();
    await visit(d.page, url);
    await refresh(a.page);
    await expect(badge(a.page, "On the way")).toBeVisible();
    // The riders are fixed from the first pickup.
    await expect(button(a.page, "Change riders")).toHaveCount(0);
    await expect(
      journey(a.page, "Handoff child A").getByText(
        "Handoff child A is with Reporting",
        { exact: true },
      ),
    ).toBeVisible();
    // No receipt before arrival, and no cancelling after pickup.
    await expect(a.page.getByRole("button", { name: steps })).toHaveCount(0);
    await expect(button(a.page, "Cancel ride")).toHaveCount(0);
    for (const name of ["Handoff child A", "Handoff child B"]) {
      await report(d.page, name, `Arrived with ${name}`);
      await expect(
        journey(d.page, name).getByText("Arrived", { exact: true }),
      ).toBeVisible();
    }
    // Arrival is saved: it is still there after leaving and coming back.
    await visit(d.page, "/app/driving");
    await expect(
      d.page
        .getByRole("region", { name: "You’re driving", exact: true })
        .getByRole("link", {
          name: new RegExp(
            `^${rideName}, .*, Dropping off\\. 2 children are waiting for a guardian$`,
          ),
        }),
    ).toBeVisible();
    await visit(d.page, url);
    await expect(badge(d.page, "Dropping off")).toBeVisible();
    for (const suffix of ["A", "B"]) {
      const row = journey(d.page, `Handoff child ${suffix}`);
      await expect(row.getByText("Arrived", { exact: true })).toBeVisible();
      await expect(
        row.getByText(
          `Waiting for Receiving guardian ${suffix} to confirm the handoff`,
          { exact: true },
        ),
      ).toBeVisible();
    }
    // The driver cannot confirm a handoff.
    await expect(d.page.getByRole("button", { name: steps })).toHaveCount(0);
    await visit(a.page, "/app/attention");
    const today = a.page.getByRole("region", {
      name: "Needs you",
      exact: true,
    });
    await expect(
      today.getByRole("link", {
        name: new RegExp(
          `^${rideName}, .*, Confirm handoff\\. Handoff child A has arrived\\. Tap when Handoff child A is with you\\.$`,
        ),
      }),
    ).toBeVisible();
    // Today offers A's own child only.
    await expect(button(today, "I have Handoff child A")).toBeVisible();
    await expect(
      today.getByRole("button", { name: /Handoff child B/ }),
    ).toHaveCount(0);
    await visit(a.page, url);
    await refresh(b.page);
    // Reaching the button, navigating away and reloading never confirms receipt.
    await button(
      journey(a.page, "Handoff child A"),
      "I have Handoff child A",
    ).focus();
    await visit(a.page, "/app/attention");
    await visit(a.page, url);
    await expect(
      journey(a.page, "Handoff child A").getByText("Arrived", { exact: true }),
    ).toBeVisible();
    // The ride names this guardian's own move, as Today does.
    await expect(badge(a.page, "Confirm handoff")).toBeVisible();
    await expect(
      a.page.getByText("Confirm you have your child", { exact: true }),
    ).toBeVisible();
    // Replay the real receipt RPC with other adults' bearer sessions.
    const post = await captureRpc(a.page, () =>
      report(a.page, "Handoff child A", "I have Handoff child A"),
    );
    for (const person of [d, b, out])
      await replayRpc(post, person.context, "unavailable");
    await visit(a.page, url);
    await expect(
      journey(a.page, "Handoff child A").getByText("Arrived", { exact: true }),
    ).toBeVisible();
    await a.page.setViewportSize({ width: 390, height: 844 });
    // The ride re-flows into one column with the phone's top bar.
    await expect(button(a.page, "Go back")).toBeVisible();
    await expect
      .poll(() =>
        a.page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      )
      .toBe(true);
    await report(a.page, "Handoff child A", "I have Handoff child A");
    await expectToast(a.page, "Handed off");
    await expect(
      journey(a.page, "Handoff child A").getByText("Handed off", {
        exact: true,
      }),
    ).toBeVisible();
    // The ride is not complete while another child waits.
    await expect(
      journey(a.page, "Handoff child B").getByText("Arrived", { exact: true }),
    ).toBeVisible();
    await expect(
      journey(a.page, "Handoff child B").getByText(
        "Waiting for Receiving guardian B to confirm the handoff",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(badge(a.page, "Dropping off")).toBeVisible();
    await expect(
      a.page.getByText("1 child is waiting for a guardian", { exact: true }),
    ).toBeVisible();
    await expect(
      a.page.getByText("Every child was handed off.", { exact: true }),
    ).toHaveCount(0);
    // Only the guardian named for a child can confirm that child's handoff.
    await expect(a.page.getByRole("button", { name: steps })).toHaveCount(0);
    await refresh(b.page);
    await expect(
      journey(b.page, "Handoff child A").getByRole("button"),
    ).toHaveCount(0);
    await expect(b.page.getByRole("button", { name: steps })).toHaveCount(1);
    await report(b.page, "Handoff child B", "I have Handoff child B");
    // The last handoff completes the ride and keeps the keyboard on that child.
    await expect(
      journey(b.page, "Handoff child B").getByRole("heading"),
    ).toBeFocused();
    await expect(
      b.page.getByText("Every child was handed off.", { exact: true }),
    ).toBeVisible();
    await expect(badge(b.page, "Completed")).toBeVisible();
    for (const person of [a, b, d]) {
      await refresh(person.page);
      await expect(badge(person.page, "Completed")).toBeVisible();
      await expect(
        person.page.getByText("Every child was handed off.", { exact: true }),
      ).toBeVisible();
      await expect(
        person.page.getByText("Handed off", { exact: true }),
      ).toHaveCount(2);
      await expect(
        person.page.getByRole("button", { name: steps }),
      ).toHaveCount(0);
      await expect(button(person.page, "Picked up everyone")).toHaveCount(0);
      // History names who did each step for each child.
      await expect(button(person.page, "History")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      const activity = person.page.getByRole("listitem").filter({
        hasText: / · .+ (picked up|arrived with|met) Handoff child [AB]$/,
      });
      await expect(activity).toHaveCount(6);
      for (const suffix of ["A", "B"]) {
        const child = `Handoff child ${suffix}`;
        for (const entry of [
          `Reporting driver picked up ${child}`,
          `Reporting driver arrived with ${child}`,
          `Receiving guardian ${suffix} met ${child}`,
        ]) {
          await expect(
            activity.filter({ hasText: new RegExp(` · ${entry}$`) }),
          ).toHaveCount(1);
        }
      }
    }
    await expect(driverCard(d.page)).toContainText("You drove");
    await expect(driverCard(a.page)).toContainText("Reporting driver drove");
    await visit(out.page, url);
    await expect(
      out.page.getByRole("heading", { name: "Ride unavailable", exact: true }),
    ).toBeVisible();
    await expect(button(out.page, "History")).toHaveCount(0);
    await expect(
      out.page.getByText("Handoff child", { exact: false }),
    ).toHaveCount(0);
    // A finished ride asks nothing more of anyone.
    await visit(a.page, "/app/attention");
    await expect(
      a.page.getByRole("heading", { level: 1, name: "Today", exact: true }),
    ).toBeVisible();
    const done = a.page.getByRole("region", { name: "Needs you", exact: true });
    await expect(done.getByRole("status")).toHaveText(
      "Nothing needs you right now.",
    );
    await expect(done.getByRole("link", { name: /Handoff/ })).toHaveCount(0);
    await expect(a.page.getByRole("button", { name: steps })).toHaveCount(0);
    await expect(
      a.page
        .getByRole("region", { name: "Rides today", exact: true })
        .getByRole("link", {
          name: new RegExp(
            `^${rideName}, .*, Completed\\. Reporting drove$`,
          ),
        }),
    ).toBeVisible();
  } finally {
    await Promise.all([a, b, d, out].map((p) => p.context.close()));
  }
});
