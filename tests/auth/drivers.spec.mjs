import { upcomingRideFields } from "../../scripts/auth-test-dates.mjs";
import { authenticatedRpc, replayDenied } from "./rpc.mjs";
import {
  visit,
  refresh,
  openAction,
  closeAction,
  account,
  addChild,
  chooseSeat,
  expectToast,
  family,
  invitation,
  joinInvitation,
  openAndCheck,
  password,
} from "./helpers.mjs";
import { test, expect } from "@playwright/test";

// The planner runs on the device's clock, so every session is a device in UTC.
const zone = "UTC";
const inUtc = (browser) => ({
  newContext: (options) => browser.newContext({ ...options, timezoneId: zone }),
});
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
async function rpc(page, name, args) {
  const response = await authenticatedRpc(page, name, args);
  expect(response.ok(), name).toBe(true);
  return response.json();
}
async function join(inviter, recipient, circleUrl, circleName) {
  await visit(inviter.page, circleUrl);
  const link = await invitation(inviter.page, recipient.email, "circle");
  const familyUrl = recipient.page.url();
  await openAndCheck(recipient.page, link);
  // An adult who owns a family joins with it; nothing else is asked.
  await joinInvitation(recipient.page, circleName);
  await expectToast(recipient.page, `You joined ${circleName}`);
  await expect(recipient.page).toHaveURL(familyUrl);
}
// Rare actions sit behind "More"; a sheet opens from there.
async function moreAction(page, title) {
  const more = button(page, "More");
  if ((await more.getAttribute("aria-expanded")) !== "true") await more.click();
  return openAction(page, title);
}
// A asks the one adult with a big enough car. Nobody approves anything: the
// ride is set as soon as that adult says yes.
async function ask(page, rideUrl) {
  await visit(page, rideUrl);
  const sheet = await openAction(page, "Ask someone else");
  // Asking is for someone else: the person asking is never in the list.
  await expect(
    sheet.getByText("Dedicated driver would drive the Journey van.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    sheet.getByText("The ride is set as soon as Dedicated says yes.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(sheet.getByText("Guardian A", { exact: false })).toHaveCount(0);
  await expect(sheet.getByRole("checkbox")).toHaveCount(0);
  await button(sheet, "Ask Dedicated to drive").click();
  await expectToast(page, "Request sent");
  await expect(sheet).toHaveCount(0);
  await expect(badge(page, "Asked Dedicated")).toBeVisible();
  await expect(
    page.getByText("Waiting for Dedicated to say yes", { exact: true }),
  ).toBeVisible();
  await expect(driverCard(page)).toContainText(
    "Dedicated driver was asked to drive",
  );
  await expect(driverCard(page)).toContainText("Journey van");
  await expect(driverCard(page)).toContainText(
    "The ride is set as soon as Dedicated says yes.",
  );
}
// The driver's yes sets the ride. The one tick left is for the seats these
// riders need.
async function accept(page, line, needs) {
  const step = nextStep(page);
  await expect(
    step.getByRole("heading", {
      name: "Can you drive this ride?",
      exact: true,
    }),
  ).toBeVisible();
  await expect(step.getByText(line, { exact: true })).toBeVisible();
  await expect(step.getByRole("checkbox")).toHaveCount(1);
  await step.getByLabel(needs, { exact: true }).check();
  await button(step, "Yes, I’ll drive").click();
  await expectToast(page, "You’re driving");
  await expect(nextStep(page)).toHaveCount(0);
  await expect(badge(page, "You’re driving")).toBeVisible();
  await expect(driverCard(page)).toContainText("You’re driving");
}
// A family changes its own riders from the Riders card.
async function changeRiders(page, { tick = [], untick = [] }) {
  const sheet = await openAction(page, "Change riders");
  for (const name of tick) await sheet.getByLabel(name, { exact: true }).check();
  for (const name of untick)
    await sheet.getByLabel(name, { exact: true }).uncheck();
  await button(sheet, "Save riders").click();
  return sheet;
}
// Adds a child from the ride itself, without leaving it.
async function addRider(page, name, seat) {
  const sheet = await openAction(page, "Add a child");
  await sheet.getByLabel("Name", { exact: true }).fill(name);
  await chooseSeat(sheet, seat);
  await button(sheet, "Add child").click();
  await expectToast(page, "Child added");
  await expect(sheet).toHaveCount(0);
}
const carFull =
  "The driver’s car doesn’t have a seat for everyone. Ask the driver to switch cars, or ask someone with a bigger car to take over.";

test("M1: an asked driver's yes sets the ride with no approvals, unanswered families don't block, and riders change with a driver set", async ({
  browser,
}) => {
  const a = await account(inUtc(browser), "m1-a"),
    b = await account(inUtc(browser), "m1-b"),
    d = await account(inUtc(browser), "m1-driver"),
    outside = await account(inUtc(browser), "m1-outside");
  const second = await browser.newContext({ timezoneId: zone });
  try {
    const familyA = await family(a.page, "Journey family A", "Guardian A");
    await family(b.page, "Journey family B", "Guardian B");
    await family(d.page, "Journey driver family", "Dedicated driver");
    await family(outside.page, "Journey outside family", "Outside adult");
    const circle = await openAction(a.page, "Create a circle");
    await circle
      .getByLabel("Circle name", { exact: true })
      .fill("M1 journey circle");
    await button(circle, "Create circle").click();
    // The new circle opens in place of the family page.
    await expectToast(a.page, "Circle created");
    await expect(
      a.page.getByRole("heading", { level: 1, name: "M1 journey circle" }),
    ).toBeVisible();
    const circleUrl = a.page.url();
    await join(a, b, circleUrl, "M1 journey circle");
    await join(a, d, circleUrl, "M1 journey circle");
    await visit(a.page, familyA);
    await addChild(a.page, "Journey A child", "booster");
    await addChild(b.page, "Journey B child", "child-seat");
    await visit(d.page, "/app/vehicles");
    const car = await openAction(d.page, "Add a car");
    await car.getByLabel("Car name", { exact: true }).fill("Journey van");
    const seats = car
      .getByRole("radiogroup", { name: "Seats for passengers", exact: true })
      .getByRole("radio", { name: "3", exact: true });
    await seats.click();
    await expect(seats).toBeChecked();
    await button(car, "Add car").click();
    await expectToast(d.page, "Journey van added");
    await expect(car).toHaveCount(0);
    await refresh(d.page);
    await expect(
      d.page.getByRole("heading", { name: "Journey van", exact: true }),
    ).toBeVisible();

    const rideTimes = upcomingRideFields();
    await visit(a.page, `/app/rides/new?date=${rideTimes.date}`);
    await expect(a.page.getByLabel("Date", { exact: true })).toHaveValue(
      rideTimes.date,
    );
    // The device's timezone is used; nobody types one.
    await expect(a.page.getByLabel(/time ?zone/i)).toHaveCount(0);
    for (const [label, value] of [
      ["From", "Journey neighborhood"],
      ["To", "Journey activity"],
      ["Pickup address", "111 Private M1 Pickup"],
      ["Drop-off address", "222 Private M1 Destination"],
      ["Pickup", rideTimes.pickup.slice(11)],
      ["Drop-off", rideTimes.dropoff.slice(11)],
    ])
      await a.page.getByLabel(label, { exact: true }).fill(value);
    // A family's only child and every other family in the circle start chosen.
    await expect(
      a.page.getByLabel("Journey A child", { exact: true }),
    ).toBeChecked();
    await expect(
      a.page.getByLabel("Journey family B", { exact: true }),
    ).toBeChecked();
    // The driver's family is left off the ride, so D only ever sees a request.
    await a.page.getByLabel("Journey driver family", { exact: true }).uncheck();
    await button(a.page, "Create ride").click();
    await expectToast(a.page, "Ride created");
    await expect(a.page).toHaveURL(/\/app\/rides\/[a-f0-9-]{36}$/);
    await expect(
      a.page.getByRole("heading", {
        name: "Journey neighborhood → Journey activity",
        exact: true,
      }),
    ).toBeVisible();
    const rideUrl = a.page.url();
    const ride = new URL(rideUrl).pathname.split("/").at(-1);
    const [saved] = await rpc(a.page, "ride_offer", { p_id: ride });
    expect(saved.timezone).toBe(zone);
    expect(new Date(saved.starts_at).toISOString()).toBe(
      `${rideTimes.pickup}:00.000Z`,
    );
    const status = async () =>
      (await rpc(a.page, "driver_status", { p_ride_id: ride }))[0];

    const revision = async () =>
      (await rpc(a.page, "ride_offer", { p_id: ride }))[0].revision;

    // A family that has not answered does not hold up a driver: the ride says
    // who has not replied and offers the driver actions straight away.
    await expect(badge(a.page, "Needs driver")).toBeVisible();
    await expect(
      a.page.getByText(
        "No one is driving yet · Journey family B hasn’t replied yet",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(driverCard(a.page)).toContainText("No driver yet");
    await expect(
      a.page.getByText(/once everyone has answered/),
    ).toHaveCount(0);
    await expect(button(a.page, "Ask someone else")).toBeVisible();
    // A has no car yet, so offering starts with adding one.
    await expect(button(a.page, "Add a car to drive")).toBeVisible();
    expect(await status()).toBeUndefined();

    // B has been invited and has not answered. A asks a driver anyway.
    await ask(a.page, rideUrl);
    await expect
      .poll(async () => {
        const state = await status();
        return [state.proposal_status, state.coverage, state.rider_count];
      })
      .toEqual(["pending", "awaiting_confirmation", 1]);
    expect((await status()).accepted_at).toBeNull();
    await expect(nextStep(a.page)).toHaveCount(0);

    await visit(d.page, "/app/driving?pending=1");
    await expect(
      d.page.getByRole("heading", { level: 1, name: "Driving", exact: true }),
    ).toBeVisible();
    const asked = d.page.getByRole("region", {
      name: "Asked to drive",
      exact: true,
    });
    await asked
      .getByRole("link", { name: /^Journey neighborhood → Journey activity, / })
      .click();
    await expect(d.page).toHaveURL(rideUrl);
    await expect(badge(d.page, "Your reply")).toBeVisible();
    await expect(
      d.page.getByText(
        "You’ll see the addresses and who’s riding once you’re the driver.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      d.page.getByText("111 Private M1 Pickup", { exact: false }),
    ).toHaveCount(0);
    await expect(
      d.page.getByText("Journey A child", { exact: false }),
    ).toHaveCount(0);
    await visit(outside.page, rideUrl);
    await expect(
      outside.page.getByRole("heading", { name: "Ride unavailable" }),
    ).toBeVisible();
    // Replay callable real acceptance action with unrelated cookies.
    await nextStep(d.page).getByLabel("I have 1 booster", { exact: true }).check();
    await replayDenied(d.page, outside.context, () =>
      button(nextStep(d.page), "Yes, I’ll drive").click(),
    );
    await visit(d.page, rideUrl);
    // Without the tick for the seats these riders need, nothing is sent.
    await button(nextStep(d.page), "Yes, I’ll drive").click();
    await expect(nextStep(d.page).getByRole("alert")).toHaveText(
      "Tick “I have 1 booster” to continue.",
    );
    expect((await status()).accepted_at).toBeNull();
    // The driver's yes covers the ride at once, while B still has not answered.
    await accept(
      d.page,
      "1 rider in your Journey van, with 1 booster.",
      "I have 1 booster",
    );
    expect((await status()).coverage).toBe("confirmed");
    await expect(
      d.page.getByText("111 Private M1 Pickup", { exact: true }),
    ).toBeVisible();
    await expect(
      d.page.getByText("1 rider · bring 1 booster", { exact: true }),
    ).toBeVisible();
    await refresh(a.page);
    await expect(badge(a.page, "Covered")).toBeVisible();
    await expect(nextStep(a.page)).toHaveCount(0);
    await expect(a.page.getByRole("button", { name: /Approve/ })).toHaveCount(0);
    await expect(driverCard(a.page)).toContainText(
      "Dedicated driver is driving",
    );
    await expect(driverCard(a.page)).toContainText("Journey van");

    // The invited family sees who is driving before it answers, and joining
    // late keeps the driver: the car has room, so the plan does not move.
    const before = await revision();
    await visit(b.page, rideUrl);
    await expect(badge(b.page, "Invited")).toBeVisible();
    await expect(
      nextStep(b.page).getByText("Dedicated is driving the Journey van.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(driverCard(b.page)).toContainText(
      "Dedicated driver is driving",
    );
    await expect(
      b.page.getByText("111 Private M1 Pickup", { exact: false }),
    ).toHaveCount(0);
    await expect(
      nextStep(b.page).getByLabel("Journey B child", { exact: true }),
    ).toBeChecked();
    await button(nextStep(b.page), "Join ride").click();
    await expectToast(b.page, "You’re in");
    await expect(badge(b.page, "Covered")).toBeVisible();
    await expect(
      b.page.getByText("111 Private M1 Pickup", { exact: true }),
    ).toBeVisible();
    await expect(nextStep(b.page)).toHaveCount(0);
    await expect(b.page.getByRole("button", { name: /Approve/ })).toHaveCount(0);
    await expect
      .poll(async () => {
        const state = await status();
        return [state.coverage, state.rider_count, state.child_seat_count];
      })
      .toEqual(["confirmed", 2, 1]);
    expect(await revision()).toBe(before);
    for (const person of [a, b, d]) {
      await refresh(person.page);
      await expect(
        badge(person.page, person === d ? "You’re driving" : "Covered"),
      ).toBeVisible();
      await expect(
        person.page.getByText("111 Private M1 Pickup", { exact: true }),
      ).toBeVisible();
    }
    // The driver sees what the riders need now.
    await expect(
      d.page.getByText("2 riders · bring 1 booster and 1 child seat", {
        exact: true,
      }),
    ).toBeVisible();
    await visit(
      a.page,
      `/app/schedule?from=${rideTimes.date}&date=${rideTimes.date}`,
    );
    await expect(
      a.page.getByRole("link", {
        name: /^Journey neighborhood → Journey activity, .*, Covered\. Dedicated is driving$/,
      }),
    ).toBeVisible();
    // Home tells A what happened since the ride was planned.
    await visit(a.page, "/app");
    const news = a.page.getByRole("region", { name: "What changed", exact: true });
    await expect(
      news.getByRole("link", {
        name: /^Dedicated is driving\. .+ · Journey neighborhood → Journey activity$/,
      }),
    ).toHaveAttribute("href", `/app/rides/${ride}`);
    // Who else is riding is news for the driver alone.
    await expect(news.getByRole("link")).toHaveCount(1);
    await visit(d.page, "/app");
    await expect(
      d.page
        .getByRole("region", { name: "What changed", exact: true })
        .getByRole("link"),
    ).toHaveAccessibleName(
      /^Journey family B joined\. .+ · Journey neighborhood → Journey activity$/,
    );
    const independent = await second.newPage();
    await visit(independent, "/sign-in");
    await independent.getByLabel("Email address").fill(b.email);
    await independent.getByLabel("Password", { exact: true }).fill(password);
    await independent
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await expect(independent).toHaveURL(/\/app$/);
    await visit(independent, rideUrl);
    await expect(badge(independent, "Covered")).toBeVisible();
    // A car that is on a ride cannot be edited from under it.
    await visit(d.page, "/app/vehicles");
    const edit = await openAction(d.page, "Edit Journey van", "Edit");
    const fewer = edit
      .getByRole("radiogroup", { name: "Seats for passengers", exact: true })
      .getByRole("radio", { name: "2", exact: true });
    await fewer.click();
    await expect(fewer).toBeChecked();
    await button(edit, "Save changes").click();
    await expect(edit.getByRole("alert")).toHaveText(
      "This car is on a ride. Use a different car for that ride first.",
    );
    await expect(d.page.getByTestId("toast")).toHaveCount(0);
    expect((await status()).passenger_seats).toBe(3);
    await visit(d.page, rideUrl);
    await d.page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        d.page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      )
      .toBe(true);
    // Stopping is its own sheet: the danger button is the confirmation.
    const stop = await moreAction(d.page, "Stop driving this ride");
    await expect(
      stop.getByText(
        "This ride will need a new driver. The families on it are told.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(stop.getByRole("checkbox")).toHaveCount(0);
    await button(stop, "Stop driving").focus();
    await d.page.keyboard.press("Enter");
    await expectToast(d.page, "You’re off this ride");
    await expect(stop).toHaveCount(0);
    await expect(badge(d.page, "Needs driver")).toBeVisible();
    await expect(
      d.page.getByText("111 Private M1 Pickup", { exact: false }),
    ).toHaveCount(0);
    await expect(
      d.page.getByText("Journey A child", { exact: false }),
    ).toHaveCount(0);
    // The families are told the ride is open again.
    for (const page of [a.page, b.page, independent]) {
      await visit(page, rideUrl);
      await expect(badge(page, "Needs driver")).toBeVisible();
      // The Driver card says who dropped out; the page does not say it twice.
      await expect(page.getByText(/Dedicated can’t drive anymore/)).toHaveCount(
        1,
      );
      await expect(driverCard(page)).toContainText(
        "Dedicated can’t drive anymore. This ride needs a driver.",
      );
    }
    await visit(a.page, "/app");
    await expect(
      news.getByRole("link", {
        name: /^Dedicated can’t drive anymore\. .+ · Journey neighborhood → Journey activity$/,
      }),
    ).toBeVisible();
    await expect(news.getByRole("link", { name: /is driving/ })).toHaveCount(0);

    // A asks again. While the request is open, B adds a second rider: the car
    // still fits, so the request carries on with the new riders.
    await ask(a.page, rideUrl);
    const asking = await revision();
    await visit(b.page, rideUrl);
    await expect(badge(b.page, "Asked Dedicated")).toBeVisible();
    await addRider(b.page, "Journey B sibling", "booster");
    const adding = await changeRiders(b.page, { tick: ["Journey B sibling"] });
    await expectToast(b.page, "Riders updated");
    await expect(adding).toHaveCount(0);
    await expect(badge(b.page, "Asked Dedicated")).toBeVisible();
    await expect
      .poll(async () => {
        const state = await status();
        return [state.proposal_status, state.coverage, state.rider_count];
      })
      .toEqual(["pending", "awaiting_confirmation", 3]);
    expect(await revision()).toBe(asking);
    await visit(d.page, rideUrl);
    await accept(
      d.page,
      "3 riders in your Journey van, with 2 boosters and 1 child seat.",
      "I have 2 boosters and 1 child seat",
    );
    for (const page of [a.page, b.page]) {
      await refresh(page);
      await expect(badge(page, "Covered")).toBeVisible();
      await expect(nextStep(page)).toHaveCount(0);
    }
    expect((await status()).coverage).toBe("confirmed");

    // With a driver set, a family can still change its riders until pickup.
    // The car is the limit: a fourth rider does not fit three seats.
    await visit(a.page, familyA);
    await addChild(a.page, "Journey A sibling", "standard");
    await visit(a.page, rideUrl);
    const full = await changeRiders(a.page, { tick: ["Journey A sibling"] });
    await expect(full.getByRole("alert")).toHaveText(carFull);
    await expect(a.page.getByTestId("toast")).toHaveCount(0);
    expect([(await status()).coverage, (await status()).rider_count]).toEqual([
      "confirmed",
      3,
    ]);
    await closeAction(a.page, "Change riders");
    await expect(badge(a.page, "Covered")).toBeVisible();
    // Taking a rider off needs nobody's yes, and the driver is told.
    await refresh(b.page);
    const covered = await revision();
    const leaving = await openAction(b.page, "Change riders");
    await expect(
      leaving.getByText(
        "Untick every child to take your family off this ride. Dedicated sees the change.",
        { exact: true },
      ),
    ).toBeVisible();
    await leaving.getByLabel("Journey B sibling", { exact: true }).uncheck();
    await button(leaving, "Save riders").click();
    await expectToast(b.page, "Riders updated");
    await expect(leaving).toHaveCount(0);
    await expect(badge(b.page, "Covered")).toBeVisible();
    await expect
      .poll(async () => (await status()).rider_count)
      .toBe(2);
    expect(await revision()).toBe(covered);
    // Now there is room, so A's second child gets on.
    await refresh(a.page);
    const room = await changeRiders(a.page, { tick: ["Journey A sibling"] });
    await expectToast(a.page, "Riders updated");
    await expect(room).toHaveCount(0);
    await expect(badge(a.page, "Covered")).toBeVisible();
    await expect
      .poll(async () => {
        const state = await status();
        return [state.coverage, state.rider_count];
      })
      .toEqual(["confirmed", 3]);
    // A whole family leaves and comes back with the driver still set.
    await refresh(b.page);
    await changeRiders(b.page, { untick: ["Journey B child"] });
    await expectToast(b.page, "Riders updated");
    await expect(badge(b.page, "Not riding")).toBeVisible();
    await expect
      .poll(async () => {
        const state = await status();
        return [state.coverage, state.rider_count];
      })
      .toEqual(["confirmed", 2]);
    // The driver is told the family left.
    await visit(d.page, "/app");
    await expect(
      d.page
        .getByRole("region", { name: "What changed", exact: true })
        .getByRole("link"),
    ).toHaveAccessibleName(
      /^Journey family B left the ride\. .+ · Journey neighborhood → Journey activity$/,
    );
    await expect(
      b.page.getByRole("heading", { name: "Join after all", exact: true }),
    ).toBeVisible();
    await b.page.getByLabel("Journey B child", { exact: true }).check();
    await button(b.page, "Join ride").click();
    await expectToast(b.page, "You’re in");
    await expect(badge(b.page, "Covered")).toBeVisible();
    await expect
      .poll(async () => {
        const state = await status();
        return [state.coverage, state.rider_count];
      })
      .toEqual(["confirmed", 3]);
    expect(await revision()).toBe(covered);
    // The driver sees the riders as they are now, and A sees a covered ride.
    await visit(d.page, rideUrl);
    await expect(badge(d.page, "You’re driving")).toBeVisible();
    await expect(
      d.page.getByText("3 riders · bring 1 booster and 1 child seat", {
        exact: true,
      }),
    ).toBeVisible();
    for (const name of ["Journey A child", "Journey A sibling", "Journey B child"])
      await expect(
        d.page
          .getByRole("heading", { name: "Riders", exact: true })
          .locator("xpath=..")
          .getByText(name, { exact: true }),
      ).toBeVisible();
    await visit(a.page, "/app/attention");
    await expect(
      a.page.getByRole("link", {
        name: /^Journey neighborhood → Journey activity, .*, Covered\. Dedicated is driving$/,
      }),
    ).toBeVisible();
    await expect(
      a.page
        .getByRole("region", { name: "Needs you", exact: true })
        .getByRole("link", { name: /Journey neighborhood/ }),
    ).toHaveCount(0);
  } finally {
    await Promise.all([
      a.context.close(),
      b.context.close(),
      d.context.close(),
      outside.context.close(),
      second.close(),
    ]);
  }
});
