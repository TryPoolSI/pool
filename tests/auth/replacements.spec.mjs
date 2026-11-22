import { authenticatedRpc, replayDenied } from "./rpc.mjs";
import {
  expandDetails,
  visit,
  refresh,
  openAction,
  closeAction,
  account,
  addChild,
  expectToast,
  family,
  invitation,
  joinInvitation,
  openAndCheck,
  password,
} from "./helpers.mjs";
import { captureState } from "./presentation.mjs";
import { test, expect } from "@playwright/test";

// The planner runs on the device's clock, and the driver's pickup step opens an
// hour before pickup. So the ride starts soon, on devices whose clock is
// nowhere near midnight.
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
const onDevice = (browser) => ({
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
const boosters = "I have 2 boosters";

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
  await joinInvitation(recipient.page, circleName);
  await expectToast(recipient.page, `You joined ${circleName}`);
  await expect(recipient.page).toHaveURL(familyUrl);
}
async function vehicle(page, label) {
  await visit(page, "/app/vehicles");
  const sheet = await openAction(page, "Add a car");
  await sheet.getByLabel("Car name", { exact: true }).fill(label);
  const seats = sheet
    .getByRole("radiogroup", { name: "Seats for passengers", exact: true })
    .getByRole("radio", { name: "3", exact: true });
  await seats.click();
  await expect(seats).toBeChecked();
  await button(sheet, "Add car").click();
  await expectToast(page, `${label} added`);
  await expect(sheet).toHaveCount(0);
}
async function signIn(page, email) {
  await visit(page, "/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await button(page, "Sign in").click();
  await expect(page).toHaveURL(/\/app$/);
}
async function expand(page, name) {
  const toggle = button(page, name);
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click();
}
// Rare actions sit behind "More"; a sheet opens from there.
async function moreAction(page, title) {
  await expand(page, "More");
  return openAction(page, title);
}
// What came of earlier requests: More → "Driver changes so far".
async function changes(page, text) {
  await expand(page, "More");
  await expand(page, "Driver changes so far");
  return page.getByText(text, { exact: false });
}
// The driver's yes: the one tick left is for the boosters these riders need.
async function accept(page, title, car) {
  const step = nextStep(page);
  await expect(
    step.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(
    step.getByText(`2 riders in your ${car}, with 2 boosters.`, {
      exact: true,
    }),
  ).toBeVisible();
  await expect(step.getByRole("checkbox")).toHaveCount(1);
  await step.getByLabel(boosters, { exact: true }).check();
  await button(step, "Yes, I’ll drive").click();
}
// Someone from a riding family asks another adult to take over, from the
// Driver card. The current driver keeps the ride until the new one says yes;
// nobody else has to approve.
async function askToTakeOver(
  page,
  { driver, car, keeps, title = "Ask someone else to drive" },
) {
  const first = driver.split(" ")[0];
  await expect(button(driverCard(page), title)).toBeVisible();
  const sheet = await openAction(page, title);
  await expect(
    sheet.getByText(`${driver} would drive the ${car}.`, { exact: true }),
  ).toBeVisible();
  await expect(
    sheet.getByText(
      `${keeps} driving until ${first} says yes. Then every family on the ride is told.`,
      { exact: true },
    ),
  ).toBeVisible();
  // The request stays open until pickup: nobody sets a deadline or ticks a box.
  await expect(sheet.getByLabel(/deadline/i)).toHaveCount(0);
  await expect(sheet.getByRole("checkbox")).toHaveCount(0);
  await button(sheet, `Ask ${first} to drive`).focus();
  await page.keyboard.press("Enter");
  await expectToast(page, "Request sent");
  await expect(sheet).toHaveCount(0);
  await expect(driverCard(page)).toContainText(
    `${driver} was asked to take over`,
  );
  await expect(driverCard(page)).toContainText(
    `${keeps} driving until ${first} says yes.`,
  );
  // One request at a time: nobody else can be asked while this one is open.
  await expect(button(page, title)).toHaveCount(0);
}
async function cancelRequest(page, keeps) {
  const sheet = await moreAction(page, "Cancel driver request");
  await expect(
    sheet.getByText(`${keeps} driving.`, { exact: true }),
  ).toBeVisible();
  await expect(sheet.getByRole("checkbox")).toHaveCount(0);
  await button(sheet, "Cancel request").click();
  await expectToast(page, "Request cancelled");
  await expect(sheet).toHaveCount(0);
}

test("R7 real adults preserve optional swaps, swap on the new driver's yes alone and persist replacement across independent sessions", async ({
  browser,
}) => {
  const a = await account(onDevice(browser), "r7-a"),
    b = await account(onDevice(browser), "r7-b"),
    d = await account(onDevice(browser), "r7-driver"),
    second = await browser.newContext({ timezoneId: zone }),
    historySession = await browser.newContext({ timezoneId: zone });
  try {
    await captureState(a.page, "empty");
    const familyA = await family(a.page, "R7 family A", "Avery Guardian");
    await family(b.page, "R7 family B", "Blake Guardian");
    await family(d.page, "R7 driver family", "Devon Driver");
    const circleSheet = await openAction(a.page, "Create a circle");
    await circleSheet
      .getByLabel("Circle name", { exact: true })
      .fill("R7 circle");
    await button(circleSheet, "Create circle").click();
    await expectToast(a.page, "Circle created");
    await expect(
      a.page.getByRole("heading", { level: 1, name: "R7 circle" }),
    ).toBeVisible();
    const circle = a.page.url();
    await join(a, b, circle, "R7 circle");
    await join(a, d, circle, "R7 circle");
    await visit(a.page, familyA);
    await addChild(a.page, "R7 child A");
    await addChild(b.page, "R7 child B");
    await vehicle(a.page, "R7 candidate car");
    await vehicle(d.page, "R7 original van");
    const rideTimes = soonRide();
    await visit(a.page, `/app/rides/new?date=${rideTimes.date}`);
    for (const [label, value] of [
      ["From", "R7 neighborhood"],
      ["To", "R7 activity"],
      ["Pickup address", "Private R7 pickup"],
      ["Drop-off address", "Private R7 destination"],
      ["Pickup", rideTimes.pickup],
      ["Drop-off", rideTimes.dropoff],
    ])
      await a.page.getByLabel(label, { exact: true }).fill(value);
    await expect(
      a.page.getByLabel("R7 child A", { exact: true }),
    ).toBeChecked();
    await expect(
      a.page.getByLabel("R7 family B", { exact: true }),
    ).toBeChecked();
    // The first driver's family has no rider: they only ever see a request.
    await a.page.getByLabel("R7 driver family", { exact: true }).uncheck();
    await button(a.page, "Create ride").click();
    await expectToast(a.page, "Ride created");
    await expect(a.page).toHaveURL(/\/app\/rides\/[a-f0-9-]{36}$/);
    await expect(
      a.page.getByRole("heading", {
        name: "R7 neighborhood → R7 activity",
        exact: true,
      }),
    ).toBeVisible();
    const ride = a.page.url();
    const rideId = new URL(ride).pathname.split("/").at(-1);
    const status = async (page = a.page) =>
      (await rpc(page, "driver_status", { p_ride_id: rideId }))[0];
    const state = async (...keys) => {
      const current = await status();
      return keys.map((key) => current[key]);
    };
    await visit(b.page, ride);
    await expect(
      nextStep(b.page).getByLabel("R7 child B", { exact: true }),
    ).toBeChecked();
    await button(nextStep(b.page), "Join ride").click();
    await expectToast(b.page, "You’re in");
    await expect(
      b.page.getByText("Private R7 pickup", { exact: true }),
    ).toBeVisible();
    await refresh(a.page);
    await captureState(a.page, "uncovered");

    // A asks the first driver. The driver's yes is all the ride waits for.
    const first = await openAction(a.page, "Ask someone else");
    await expect(
      first.getByText("Devon Driver would drive the R7 original van.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      first.getByText("The ride is set as soon as Devon says yes.", {
        exact: true,
      }),
    ).toBeVisible();
    await button(first, "Ask Devon to drive").click();
    await expectToast(a.page, "Request sent");
    await expect(first).toHaveCount(0);
    await expect(badge(a.page, "Asked Devon")).toBeVisible();
    await expect(driverCard(a.page)).toContainText(
      "Devon Driver was asked to drive",
    );
    await expect(driverCard(a.page)).toContainText(
      "The ride is set as soon as Devon says yes.",
    );
    await captureState(a.page, "pending", "Driver");
    await visit(d.page, ride);
    await accept(d.page, "Can you drive this ride?", "R7 original van");
    await expectToast(d.page, "You’re driving");
    await expect(driverCard(d.page)).toContainText("You’re driving");
    await expect(badge(d.page, "You’re driving")).toBeVisible();
    expect(await state("mode", "coverage", "current_driver_name")).toEqual([
      "initial",
      "confirmed",
      "Devon Driver",
    ]);
    // Neither family is asked to approve the driver.
    for (const page of [a.page, b.page]) {
      await refresh(page);
      await expect(badge(page, "Covered")).toBeVisible();
      await expect(nextStep(page)).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Approve/ })).toHaveCount(0);
      await expect(driverCard(page)).toContainText("Devon Driver is driving");
    }
    await captureState(a.page, "confirmed", "Driver");

    // Asking someone to take over is for someone else. A's only other choice
    // would be A, and the driver who holds the ride is not a replacement.
    const nobody = await openAction(a.page, "Ask someone else to drive");
    await expect(
      nobody.getByText(
        "Nobody else in this circle has a car with a seat for every rider yet.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(nobody.getByRole("button", { name: /^Ask / })).toHaveCount(0);
    await closeAction(a.page, "Ask someone else to drive");

    // B asks A to take over. The swap is optional: Devon keeps the ride.
    await refresh(b.page);
    const swap = {
      driver: "Avery Guardian",
      car: "R7 candidate car",
      keeps: "Devon keeps",
    };
    await askToTakeOver(b.page, swap);
    await expect(badge(b.page, "Covered")).toBeVisible();
    await expect(driverCard(b.page)).toContainText("Devon Driver is driving");
    await expect(driverCard(b.page)).toContainText("R7 candidate car");
    await expect
      .poll(() =>
        state("mode", "proposal_status", "coverage", "current_driver_name"),
      )
      .toEqual(["optional_swap", "pending", "confirmed", "Devon Driver"]);
    // Being asked to take over is A's move, on a ride that stays covered.
    await refresh(a.page);
    await expect(badge(a.page, "Your reply")).toBeVisible();
    await expect(
      nextStep(a.page).getByRole("heading", {
        name: "Can you take over driving?",
        exact: true,
      }),
    ).toBeVisible();
    await expect(driverCard(a.page)).toContainText("Devon Driver is driving");
    await expect(driverCard(a.page)).toContainText(
      "You were asked to take over",
    );
    await expect(driverCard(a.page)).toContainText(
      "Devon keeps driving until you say yes.",
    );
    const cancelled = (await status()).proposal_id;
    await cancelRequest(b.page, "Devon keeps");
    await expect(badge(b.page, "Covered")).toBeVisible();
    await expect(driverCard(b.page)).not.toContainText("asked to take over");
    await refresh(a.page);
    await expect(badge(a.page, "Covered")).toBeVisible();
    await expect(nextStep(a.page)).toHaveCount(0);
    await expect(
      await changes(a.page, "Blake Guardian cancelled the request"),
    ).toHaveCount(1);
    await captureState(a.page, "closed-swap", "Driver");
    // Closed candidate replies never change the still-available original assignment.
    const late = await authenticatedRpc(a.page, "accept_driver_proposal", {
      p_id: cancelled,
      p_revision: (await status()).ride_revision,
      p_available_seats: 3,
      p_restraints: true,
    });
    expect(late.ok()).toBe(false);
    expect((await late.json()).code).toBe("PT409");
    expect(
      await state("proposal_status", "coverage", "current_driver_name"),
    ).toEqual(["cancelled", "confirmed", "Devon Driver"]);
    await refresh(b.page);
    await askToTakeOver(b.page, swap);
    await refresh(a.page);
    await button(nextStep(a.page), "I can’t").click();
    await expectToast(a.page, "Reply sent");
    await expect(nextStep(a.page)).toHaveCount(0);
    await expect(badge(a.page, "Covered")).toBeVisible();
    await expect(driverCard(a.page)).toContainText("Devon Driver is driving");
    await expect(driverCard(a.page)).not.toContainText("asked to take over");
    await expect(await changes(a.page, "Avery Guardian said no")).toHaveCount(
      1,
    );
    expect(await state("proposal_status", "coverage")).toEqual([
      "declined",
      "confirmed",
    ]);
    await captureState(a.page, "declined", "Driver");
    await refresh(b.page);
    await askToTakeOver(b.page, swap);
    // The screen keeps a request open until pickup.
    const [planned] = await rpc(b.page, "ride_offer", { p_id: rideId });
    expect(planned.timezone).toBe(zone);
    expect(new Date((await status()).deadline).getTime()).toBe(
      new Date(planned.starts_at).getTime(),
    );
    await cancelRequest(b.page, "Devon keeps");
    // A real database deadline expires without a scheduler or a simulated browser clock.
    // The screen has no deadline to set, so this short-lived request is sent directly.
    const current = await status(b.page);
    const [seat] = await rpc(b.page, "ride_offer", { p_id: rideId });
    const candidate = (
      await rpc(b.page, "driver_options", { p_ride_id: rideId })
    ).find((option) => option.vehicle_label === "R7 candidate car");
    const expiring = crypto.randomUUID();
    await rpc(b.page, "request_replacement", {
      p_id: expiring,
      p_ride_id: rideId,
      p_family_id: seat.family_id,
      p_revision: seat.revision,
      p_driver_id: candidate.driver_id,
      p_driver_family_id: candidate.driver_family_id,
      p_vehicle_id: candidate.vehicle_id,
      p_vehicle_version: candidate.vehicle_version,
      p_mode: "optional_swap",
      p_original_assignment_id: current.current_assignment_id,
      p_original_assignment_revision: current.current_assignment_revision,
      p_deadline: new Date(Date.now() + 8000).toISOString(),
    });
    await refresh(a.page);
    await expect(
      nextStep(a.page).getByRole("heading", {
        name: "Can you take over driving?",
        exact: true,
      }),
    ).toBeVisible();
    await expect
      .poll(
        async () => {
          await refresh(a.page);
          return nextStep(a.page).count();
        },
        { timeout: 20000 },
      )
      .toBe(0);
    expect(await state("proposal_id", "proposal_status", "coverage")).toEqual([
      expiring,
      "expired",
      "confirmed",
    ]);
    await expect(badge(a.page, "Covered")).toBeVisible();
    await expect(driverCard(a.page)).toContainText("Devon Driver is driving");
    await expect(driverCard(a.page)).not.toContainText("asked to take over");
    await expect(button(a.page, "Yes, I’ll drive")).toHaveCount(0);
    // A yes that arrives after the deadline is refused.
    const tooLate = await authenticatedRpc(a.page, "accept_driver_proposal", {
      p_id: expiring,
      p_revision: current.ride_revision,
      p_available_seats: 3,
      p_restraints: true,
    });
    expect(tooLate.ok()).toBe(false);
    expect(["PT409", "PT410"]).toContain((await tooLate.json()).code);
    expect(await state("coverage", "current_driver_name")).toEqual([
      "confirmed",
      "Devon Driver",
    ]);
    await captureState(a.page, "expired", "Driver");

    // A new request can follow the one that ran out of time.
    await refresh(b.page);
    await askToTakeOver(b.page, swap);
    await expect(
      await changes(b.page, "The request ran out of time"),
    ).toHaveCount(1);
    await visit(a.page, "/app/attention");
    const needsYou = a.page.getByRole("region", {
      name: "Needs you",
      exact: true,
    });
    await expect(
      needsYou.getByRole("link", {
        name: /^R7 neighborhood → R7 activity, .*, Your reply\. Can you take over from Devon\? You’d drive the R7 candidate car\.$/,
      }),
    ).toBeVisible();
    await expect(button(needsYou, "Yes, I’ll drive")).toBeVisible();
    await expect(button(needsYou, "I can’t")).toBeVisible();
    // Actual callable driver response replay under a different participant cannot impersonate A.
    await visit(a.page, ride);
    await nextStep(a.page).getByLabel(boosters, { exact: true }).check();
    await replayDenied(a.page, b.context, () =>
      button(nextStep(a.page), "Yes, I’ll drive").click(),
    );
    expect((await status()).accepted_at).toBeNull();

    // The driver who holds the ride steps back while the swap is still open.
    await visit(d.page, ride);
    await expect(driverCard(d.page)).toContainText("You’re driving");
    const stop = await moreAction(d.page, "Stop driving this ride");
    await expect(stop.getByRole("checkbox")).toHaveCount(0);
    await button(stop, "Stop driving").click();
    await expect(
      d.page.getByRole("heading", { name: "Ride unavailable", exact: true }),
    ).toBeVisible();
    // That leaves no driver and closes the swap: A is no longer asked.
    await visit(a.page, ride);
    await expect(badge(a.page, "Needs driver")).toBeVisible();
    await expect(nextStep(a.page)).toHaveCount(0);
    await expect(driverCard(a.page)).toContainText("No driver yet");
    await expect(driverCard(a.page)).toContainText(
      "Devon can’t drive anymore. This ride needs a driver.",
    );
    expect(await state("proposal_status", "coverage")).toEqual([
      "invalidated",
      "needs_driver",
    ]);

    // A offers to drive instead, and is the driver as soon as the offer is in.
    const offer = await openAction(a.page, "I’ll drive");
    await expect(
      offer.getByText("You’ll drive the R7 candidate car.", { exact: true }),
    ).toBeVisible();
    await expect(
      offer.getByText(
        "You’re the driver as soon as you tap. The families on this ride are told.",
        { exact: true },
      ),
    ).toBeVisible();
    await button(offer, "I’ll drive").click();
    await expect(offer.getByRole("alert")).toHaveText(
      `Tick “${boosters}” to continue.`,
    );
    await offer.getByLabel(boosters, { exact: true }).check();
    await button(offer, "I’ll drive").click();
    await expectToast(a.page, "You’re driving");
    await expect(offer).toHaveCount(0);
    await expect(badge(a.page, "You’re driving")).toBeVisible();
    await expect(driverCard(a.page)).toContainText("You’re driving");
    await expect(driverCard(a.page)).toContainText("R7 candidate car");
    await expect(nextStep(a.page)).toHaveCount(0);
    const offered = await status();
    expect([
      offered.mode,
      offered.coverage,
      offered.rider_count,
      offered.current_driver_name,
      Boolean(offered.accepted_at),
    ]).toEqual(["unavailable", "confirmed", 2, "Avery Guardian", true]);
    // The other family is told, in every one of its sessions. It approves nothing.
    const independent = await second.newPage();
    await signIn(independent, b.email);
    await expect(
      independent
        .getByRole("region", { name: "What changed", exact: true })
        .getByRole("link", {
          name: /^Avery is driving\. .+ · R7 neighborhood → R7 activity$/,
        }),
    ).toBeVisible();
    await visit(independent, ride);
    await independent.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        independent.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      )
      .toBe(true);
    await expect(badge(independent, "Covered")).toBeVisible();
    await expect(nextStep(independent)).toHaveCount(0);
    await expect(
      independent.getByRole("button", { name: /Approve/ }),
    ).toHaveCount(0);
    for (const page of [a.page, b.page, independent]) {
      await visit(page, ride);
      await expect(
        badge(page, page === a.page ? "You’re driving" : "Covered"),
      ).toBeVisible();
      await expect(driverCard(page)).toContainText(
        page === a.page ? "You’re driving" : "Avery Guardian is driving",
      );
      await expect(driverCard(page)).toContainText("R7 candidate car");
      await expect(
        (await changes(page, "The change went through")).last(),
      ).toBeVisible();
    }
    // A second optional swap needs the new driver's yes and nothing else.
    await askToTakeOver(a.page, {
      driver: "Devon Driver",
      car: "R7 original van",
      keeps: "You keep",
      title: "Ask someone to take over",
    });
    await visit(d.page, "/app/driving?pending=1");
    await d.page
      .getByRole("region", { name: "Asked to drive", exact: true })
      .getByRole("link", { name: /^R7 neighborhood → R7 activity, / })
      .click();
    await expect(d.page).toHaveURL(ride);
    // Being asked again shows the request, not the addresses or the riders.
    await expect(
      d.page.getByText(
        "You’ll see the addresses and who’s riding once you’re the driver.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      d.page.getByText("Private R7 pickup", { exact: false }),
    ).toHaveCount(0);
    await expect(d.page.getByText("R7 child", { exact: false })).toHaveCount(0);
    // A keeps the ride until Devon answers.
    expect(await state("mode", "coverage", "current_driver_name")).toEqual([
      "optional_swap",
      "confirmed",
      "Avery Guardian",
    ]);
    await accept(d.page, "Can you take over driving?", "R7 original van");
    await expectToast(d.page, "You’re driving");
    // Devon's yes is the swap: A is released and no family approves.
    const takeover = await status();
    expect([
      takeover.mode,
      takeover.coverage,
      takeover.current_driver_name,
      Boolean(takeover.accepted_at),
    ]).toEqual(["optional_swap", "confirmed", "Devon Driver", true]);
    await expect(badge(d.page, "You’re driving")).toBeVisible();
    await expect(driverCard(d.page)).toContainText("You’re driving");
    await expect(driverCard(d.page)).toContainText("R7 original van");
    await expect(
      d.page.getByText("Private R7 pickup", { exact: true }),
    ).toBeVisible();
    for (const page of [a.page, b.page]) {
      await refresh(page);
      await expect(badge(page, "Covered")).toBeVisible();
      await expect(nextStep(page)).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Approve/ })).toHaveCount(0);
      await expect(driverCard(page)).toContainText("Devon Driver is driving");
    }
    await expect(await changes(a.page, "The change went through")).toHaveCount(
      2,
    );
    // The family that said nothing is told who took over.
    await visit(b.page, "/app");
    await expect(
      b.page
        .getByRole("region", { name: "What changed", exact: true })
        .getByRole("link", {
          name: /^Devon took over driving\. .+ · R7 neighborhood → R7 activity$/,
        }),
    ).toHaveAttribute("href", `/app/rides/${rideId}`);
    await captureState(b.page, "home-what-changed", "What changed");

    // An unsuccessful new swap must preserve the actual driver's completed page and history.
    const child = (page, name) =>
      page.getByRole("article", { name, exact: true });
    // Putting a child on the ride named that guardian to meet them.
    for (const [parent, name, guardian] of [
      [a, "R7 child A", "Avery Guardian"],
      [b, "R7 child B", "Blake Guardian"],
    ]) {
      await visit(parent.page, ride);
      const row = child(parent.page, name);
      await expect(
        row.getByText(`Who meets ${name}?`, { exact: true }),
      ).toBeVisible();
      await expect(row.getByText("You", { exact: true })).toBeVisible();
      await expect(button(row, `I’ll meet ${name}`)).toHaveCount(0);
      await expect(
        child(d.page, name).getByText(guardian, { exact: true }),
      ).toBeVisible();
    }
    await askToTakeOver(b.page, swap);
    await visit(d.page, ride);
    for (const name of ["R7 child A", "R7 child B"]) {
      const row = child(d.page, name);
      await button(row, `Picked up ${name}`).click();
      await expect(row.getByText("Picked up", { exact: true })).toBeVisible();
      await button(row, `Arrived with ${name}`).click();
      await expect(row.getByText("Arrived", { exact: true })).toBeVisible();
    }
    // The first pickup closed the open swap: Devon is the trip's driver.
    expect(
      await state("proposal_status", "coverage", "current_driver_name"),
    ).toEqual(["invalidated", "confirmed", "Devon Driver"]);
    await visit(a.page, ride);
    await expect(badge(a.page, "Confirm handoff")).toBeVisible();
    await expect(nextStep(a.page)).toHaveCount(0);
    await expect(button(a.page, "Yes, I’ll drive")).toHaveCount(0);
    await captureState(a.page, "awaiting-handoff", "Trip");
    for (const [parent, name] of [
      [a, "R7 child A"],
      [b, "R7 child B"],
    ]) {
      await visit(parent.page, ride);
      const row = child(parent.page, name);
      await button(row, `I have ${name}`).click();
      await expect(row.getByText("Handed off", { exact: true })).toBeVisible();
    }
    const met = (page) => page.getByText(/ met R7 child [AB]$/);
    await visit(d.page, ride);
    await expect(badge(d.page, "Completed")).toBeVisible();
    await expect(
      d.page.getByText("Every child was handed off.", { exact: true }),
    ).toBeVisible();
    await expect(driverCard(d.page)).toContainText("You drove");
    await captureState(d.page, "completed", "Trip");
    await expect(d.page.getByText("Handed off", { exact: true })).toHaveCount(
      2,
    );
    await expect(met(d.page)).toHaveCount(2);
    await expect(
      d.page.getByRole("button", {
        name: /^(Picked up|Arrived with|I have|Stop driving|More$)/,
      }),
    ).toHaveCount(0);
    await visit(
      a.page,
      `/app/schedule?from=${rideTimes.date}&date=${rideTimes.date}`,
    );
    await expect(
      a.page.getByRole("link", {
        name: /^R7 neighborhood → R7 activity, .*, Completed\. Devon drove$/,
      }),
    ).toBeVisible();
    const historyPage = await historySession.newPage();
    await signIn(historyPage, d.email);
    await visit(historyPage, "/app/driving");
    await historyPage
      .getByRole("link", {
        name: /^R7 neighborhood → R7 activity, .*, Completed\. You drove$/,
      })
      .click();
    await expect(historyPage.getByRole("heading", { level: 1 })).toHaveText(
      "R7 neighborhood → R7 activity",
    );
    await expandDetails(historyPage);
    await expect(
      historyPage.getByText("Handed off", { exact: true }),
    ).toHaveCount(2);
    await expect(met(historyPage)).toHaveCount(2);
  } catch (error) {
    console.error(error.stack ?? String(error));
    throw error;
  } finally {
    await Promise.all([
      a.context.close(),
      b.context.close(),
      d.context.close(),
      second.close(),
      historySession.close(),
    ]);
  }
});
