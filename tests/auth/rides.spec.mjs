import {
  captureRpc,
  replayRpc,
  privateChildId,
  authenticatedRpc,
  ownChild,
  sessionToken,
} from "./rpc.mjs";
import {
  expandDetails,
  visit,
  refresh,
  openAction,
  account,
  addChild,
  chooseSeat,
  expectToast,
  family,
  invitation,
  joinInvitation,
  openAndCheck,
  submitSignIn,
} from "./helpers.mjs";
import { captureState } from "./presentation.mjs";
import { test, expect } from "@playwright/test";

// The planner and the Schedule run on the device's clock, so every session in
// these journeys is a device in Denver.
const zone = "America/Denver";
const inDenver = (browser) => ({
  newContext: (options) => browser.newContext({ ...options, timezoneId: zone }),
});
// The next Denver fall-back day (the first Sunday of November). It exercises
// the repeated hour, and it is far enough ahead to stay out of Today and Home.
const rideDate = (() => {
  const soonest = Date.now() + 14 * 86400_000;
  for (let year = new Date().getUTCFullYear(); ; year++) {
    const first = new Date(Date.UTC(year, 10, 1));
    const sunday = new Date(
      Date.UTC(year, 10, 1 + ((7 - first.getUTCDay()) % 7)),
    );
    if (sunday.getTime() > soonest) return sunday.toISOString().slice(0, 10);
  }
})();
const shift = (date, days) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400_000)
    .toISOString()
    .slice(0, 10);
// "Sunday, Nov 7": how the Schedule names a day.
const dayName = (date) =>
  new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
const days = (page) =>
  page.getByRole("tablist", { name: "Days this week", exact: true });
const dayTab = (page, date) =>
  days(page).getByRole("tab", { name: new RegExp(`^${dayName(date)},`) });
const field = (page, label) => page.getByLabel(label, { exact: true });
const button = (scope, name) =>
  scope.getByRole("button", { name, exact: true });
// The ride's state badge sits beside its title.
const badge = (page, label) =>
  page
    .getByRole("heading", { level: 1 })
    .locator("xpath=../..")
    .getByText(label, { exact: true });

async function createCircle(page, name) {
  const dialog = await openAction(page, "Create a circle");
  await dialog.getByLabel("Circle name", { exact: true }).fill(name);
  await button(dialog, "Create circle").click();
  // The new circle opens in place of the family page; nothing else to press.
  await expectToast(page, "Circle created");
  await expect(page).toHaveURL(/\/app\/circles\/[a-f0-9-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  return page.url();
}
async function joinCircle(inviter, recipient, circleUrl, circleName) {
  await visit(inviter.page, circleUrl);
  const link = await invitation(inviter.page, recipient.email, "circle");
  const familyUrl = recipient.page.url();
  await openAndCheck(recipient.page, link);
  // An adult who owns a family joins with it; nothing else is asked.
  await joinInvitation(recipient.page, circleName);
  await expectToast(recipient.page, `You joined ${circleName}`);
  await expect(recipient.page).toHaveURL(familyUrl);
}
// Fills the planner's route and time. The timezone is never asked for.
async function fillRide(page, { from, to, pickup, dropoff, starts, ends }) {
  await field(page, "From").fill(from);
  await field(page, "To").fill(to);
  await field(page, "Pickup address").fill(pickup);
  await field(page, "Drop-off address").fill(dropoff);
  await expect(page.getByLabel(/time ?zone/i)).toHaveCount(0);
  await field(page, "Pickup").fill(starts);
  // Drop-off follows pickup by half an hour until the person sets it.
  const [hours, minutes] = starts.split(":").map(Number);
  const total = hours * 60 + minutes + 30;
  await expect(field(page, "Drop-off")).toHaveValue(
    `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`,
  );
  await field(page, "Drop-off").fill(ends);
}
// Creating a ride replaces the planner with the new ride and confirms once.
async function created(page) {
  await expectToast(page, "Ride created");
  await expect(page).toHaveURL(/\/app\/rides\/[a-f0-9-]{36}$/);
  // The planner is gone, so a second press cannot send another request.
  await expect(button(page, "Create ride")).toHaveCount(0);
  return page.url();
}
async function plan(page, direction) {
  await visit(page, `/app/rides/new?date=${rideDate}`);
  await expect(field(page, "Date")).toHaveValue(rideDate);
  await page
    .getByRole("radiogroup", { name: "Direction", exact: true })
    .getByRole("radio", {
      name: direction === "outbound" ? "Outbound" : "Return",
      exact: true,
    })
    .click();
  await fillRide(page, {
    from: direction === "outbound" ? "Morning area" : "Activity area",
    to: direction === "outbound" ? "Activity area" : "Home area",
    pickup: "101 Secret Pickup, side door",
    dropoff: "202 Secret Dropoff, room 2",
    starts: direction === "outbound" ? "01:30" : "15:00",
    ends: direction === "outbound" ? "02:30" : "16:00",
  });
  // A family's only child and every other family in the circle start chosen.
  await expect(field(page, "Creator child")).toBeChecked();
  await expect(field(page, "Invited browser family")).toBeChecked();
  // Unticking a family leaves it off the ride: it never learns the ride exists.
  await expect(field(page, "Coordinator browser family")).toBeChecked();
  await field(page, "Coordinator browser family").uncheck();
  if (direction === "outbound") {
    const repeated = page.getByRole("radiogroup", {
      name: "The clocks go back that night. Which one?",
      exact: true,
    });
    await expect(repeated).toHaveCount(0);
    await button(page, "Create ride").click();
    await expect(page.locator('[role="alert"]')).toContainText("occurs twice");
    await repeated.getByRole("radio", { name: "Later hour", exact: true }).click();
  }
  await button(page, "Create ride").click();
  const url = await created(page);
  await expect(badge(page, "Needs driver")).toBeVisible();
  await expandDetails(page);
  return url;
}
// Opens "Cancel ride" (under More) and ticks its one confirmation.
async function cancelRide(page) {
  const dialog = await openAction(page, "Cancel ride");
  await dialog.getByLabel("Cancel for every family", { exact: true }).check();
  return button(dialog, "Cancel ride");
}
// Keeps a screen on what it has already loaded: every data read stays
// unanswered, so the 20-second refresh cannot update its forms. Only the
// named command still reaches the server.
async function holdReads(page, command) {
  await page.route("**/rest/v1/**", async (route) => {
    const request = route.request();
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith(`/rpc/${command}`)
    )
      await route.continue();
  });
}
async function deniedReplay(page, otherContext, click, expected) {
  const captured = await captureRpc(page, click);
  await replayRpc(captured, otherContext, expected);
  return captured;
}
async function replay(captured, otherContext, expected) {
  await replayRpc(captured, otherContext, expected);
}

test("R4 real multi-session planning, private offers, endpoint denials, enrollment races, schedule and cancellation", async ({
  browser,
}) => {
  const creator = await account(inDenver(browser), "ride-creator"),
    other = await account(inDenver(browser), "ride-other"),
    coordinator = await account(inDenver(browser), "ride-coordinator"),
    outsider = await account(inDenver(browser), "ride-outsider");
  const independent = await browser.newContext({ timezoneId: zone });
  let tehran;
  try {
    await family(creator.page, "Creator browser family", "Creator adult");
    const otherFamilyUrl = await family(other.page, "Invited browser family", "Invited adult");
    await family(
      coordinator.page,
      "Coordinator browser family",
      "Coordinator adult",
    );
    await family(outsider.page, "Unrelated browser family", "Outside adult");
    const circleUrl = await createCircle(coordinator.page, "R4 browser circle");
    await joinCircle(coordinator, creator, circleUrl, "R4 browser circle");
    const creatorFamily = creator.page.url();
    await joinCircle(coordinator, other, circleUrl, "R4 browser circle");
    // A family without children adds its first one from the planner itself.
    await visit(creator.page, "/app/rides/new");
    await expect(
      creator.page.getByText("Add a child to put them on this ride.", {
        exact: true,
      }),
    ).toBeVisible();
    const addChildSheet = await openAction(creator.page, "Add a child");
    await addChildSheet.getByLabel("Name", { exact: true }).fill("Creator child");
    await chooseSeat(addChildSheet, "booster");
    await button(addChildSheet, "Add child").click();
    await expectToast(creator.page, "Child added");
    await expect(addChildSheet).toHaveCount(0);
    await expect(field(creator.page, "Creator child")).toBeChecked();
    const childId = await privateChildId(creator.page, "Creator child");
    await addChild(other.page, "Invited child");
    // Public RPCs reject a foreign child's ID under the other real adult's session.
    const own = await ownChild(other.page, "Invited child");
    const foreign = await authenticatedRpc(other.page, "save_own_child", {
      p_id: childId,
      p_family_id: own.family_id,
      p_display_name: "Foreign edit",
      p_seat_requirement: "standard",
      p_revision: own.revision,
    });
    expect(foreign.ok()).toBe(false);
    expect((await foreign.json()).code).toBe("PT404");
    const rideUrl = await plan(creator.page, "outbound");
    const rideId = new URL(rideUrl).pathname.split("/").at(-1);
    // The later of the two 1:30s was saved, in the device's own timezone.
    const [saved] = await (
      await authenticatedRpc(creator.page, "ride_offer", { p_id: rideId })
    ).json();
    expect(saved.timezone).toBe(zone);
    expect(new Date(saved.starts_at).toISOString()).toBe(
      `${rideDate}T08:30:00.000Z`,
    );
    // An unanswered invitation is named, and it does not hold up a driver.
    await expect(
      creator.page.getByText(
        "No one is driving yet · Invited browser family hasn’t replied yet",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(button(creator.page, "Ask someone else")).toBeVisible();
    await expect(button(creator.page, "Add a car to drive")).toBeVisible();
    await visit(other.page, rideUrl);
    // The invitation asks one question, with this family's own child chosen.
    await expect(
      other.page.getByRole("heading", {
        name: "Are your children joining this ride?",
        exact: true,
      }),
    ).toBeVisible();
    await expect(badge(other.page, "Invited")).toBeVisible();
    await expect(field(other.page, "Invited child")).toBeChecked();
    await expect(button(other.page, "Add a child")).toBeVisible();
    await expect(
      other.page.getByText("Join to see addresses and who’s riding.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      other.page.getByText("Morning area", { exact: true }),
    ).toBeVisible();
    await expect(
      other.page.getByText("101 Secret Pickup, side door", { exact: false }),
    ).toHaveCount(0);
    await expect(
      other.page.getByText("Creator child", { exact: false }),
    ).toHaveCount(0);
    await expect(
      other.page.getByRole("heading", { name: "Driver", exact: true }),
    ).toHaveCount(0);
    for (const person of [coordinator, outsider]) {
      await visit(person.page, rideUrl);
      await expect(
        person.page.getByRole("heading", { name: "Ride unavailable" }),
      ).toBeVisible();
    }
    // The callable enrollment endpoint also rejects a foreign family's child.
    const offer = await authenticatedRpc(other.page, "ride_offer", {
      p_id: rideId,
    });
    const summary = (await offer.json()).find(
      (item) => item.family_id === own.family_id,
    );
    const forged = await authenticatedRpc(
      other.page,
      "respond_to_ride_invitation",
      {
        p_ride_id: rideId,
        p_family_id: own.family_id,
        p_revision: summary.revision,
        p_accept: true,
        p_child_ids: [childId],
      },
    );
    expect(forged.ok()).toBe(false);
    expect((await forged.json()).code).toBe("PT400");
    await refresh(other.page);
    expect(
      (await independent.request.get(rideUrl, { maxRedirects: 0 })).status(),
    ).toBe(200);
    // Both circle membership and coordinator status fail the same creator endpoint.
    const cancelUnderCapture = await cancelRide(creator.page);
    await deniedReplay(
      creator.page,
      coordinator.context,
      () => cancelUnderCapture.click(),
      "unavailable",
    );
    await visit(creator.page, rideUrl);
    // From here this screen keeps the ride as it is now, before anyone joins.
    const staleCancel = await cancelRide(creator.page);
    await holdReads(creator.page, "cancel_ride");
    // Unrelated user replays an enrollment action, without any form of ride access.
    await expect(field(other.page, "Invited child")).toBeChecked();
    const enrollmentPost = await deniedReplay(
      other.page,
      outsider.context,
      () => button(other.page, "Join ride").click(),
      "unavailable",
    );
    await visit(other.page, rideUrl);
    const secondPage = await independent.newPage();
    const rideReturn = new URL(rideUrl);
    rideReturn.searchParams.set("family", new URL(otherFamilyUrl).pathname.split("/").at(-1));
    await secondPage.goto(rideReturn.href);
    await submitSignIn(secondPage, other.email);
    await expect(secondPage).toHaveURL(rideReturn.href);
    await expect(field(other.page, "Invited child")).toBeChecked();
    await expect(field(secondPage, "Invited child")).toBeChecked();
    await Promise.all([
      button(other.page, "Join ride").click(),
      button(secondPage, "Join ride").click(),
    ]);
    // One session joins and is told so; the other is told the ride changed.
    await expect
      .poll(
        async () =>
          (await other.page.locator('[role="alert"]').count()) +
          (await secondPage.locator('[role="alert"]').count()),
      )
      .toBe(1);
    const loser = (await other.page.locator('[role="alert"]').count())
      ? other.page
      : secondPage;
    await expect(loser.locator('[role="alert"]')).toHaveText(
      "Someone else just changed this ride. It updates here in a moment; then try again.",
    );
    for (const page of [other.page, secondPage]) {
      await refresh(page);
      await expect(badge(page, "Needs driver")).toBeVisible();
      await expect(
        page.getByText("101 Secret Pickup, side door", { exact: true }),
      ).toBeVisible();
      const rider = page
        .getByRole("heading", { name: "Riders", exact: true })
        .locator("xpath=..")
        .getByText("Invited child", { exact: true });
      await expect(rider).toHaveCount(1);
      await expect(rider.locator("xpath=..")).toHaveText(
        /^Invited child\s*Booster$/,
      );
    }
    // Creator's independent stale form must not cancel the newly changed roster.
    await staleCancel.click();
    await expect(creator.page.locator('[role="alert"]')).toHaveText(
      "Someone else just changed this ride. It updates here in a moment; then try again.",
    );
    await creator.page.unrouteAll({ behavior: "ignoreErrors" });
    await refresh(creator.page);
    await expect(badge(creator.page, "Needs driver")).toBeVisible();
    await expect(badge(creator.page, "Cancelled")).toHaveCount(0);
    // Taking every child off the ride takes the private details away again.
    const riders = await openAction(other.page, "Change riders");
    await riders.getByLabel("Invited child", { exact: true }).uncheck();
    await button(riders, "Save riders").click();
    await expectToast(other.page, "Riders updated");
    await expect(riders).toHaveCount(0);
    await expect(
      other.page.getByText("Join to see addresses and who’s riding.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      other.page.getByText("101 Secret Pickup, side door", { exact: false }),
    ).toHaveCount(0);
    await expect(
      other.page.getByText("Creator child", { exact: false }),
    ).toHaveCount(0);
    // The family is off the ride, so there is nothing left to decline.
    await expect(badge(other.page, "Not riding")).toBeVisible();
    await expect(
      other.page.getByText("Your family isn’t on this ride", { exact: true }),
    ).toBeVisible();
    await expect(button(other.page, "Decline")).toHaveCount(0);
    // It can still join again while the ride is ahead.
    await expect(
      other.page.getByRole("heading", { name: "Join after all", exact: true }),
    ).toBeVisible();
    await expect(field(other.page, "Invited child")).toBeChecked();
    await button(other.page, "Join ride").click();
    await expectToast(other.page, "You’re in");
    await expect(
      other.page.getByText("101 Secret Pickup, side door", { exact: true }),
    ).toBeVisible();
    const returnUrl = await plan(creator.page, "return");
    // Declining an invitation answers it without showing the private details.
    await visit(other.page, returnUrl);
    await expect(badge(other.page, "Invited")).toBeVisible();
    await button(other.page, "Decline").click();
    await expectToast(other.page, "Ride declined");
    await expect(badge(other.page, "Not riding")).toBeVisible();
    await expect(
      other.page.getByText("Your family isn’t on this ride", { exact: true }),
    ).toBeVisible();
    await expect(
      other.page.getByRole("heading", { name: "Join after all", exact: true }),
    ).toBeVisible();
    await expect(
      other.page.getByText("Join to see addresses and who’s riding.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      other.page.getByText("101 Secret Pickup, side door", { exact: false }),
    ).toHaveCount(0);
    await visit(other.page, rideUrl);
    // A date outside the opening week starts the day strip on that date.
    await visit(creator.page, `/app/schedule?date=${rideDate}`);
    await expect(days(creator.page).getByRole("tab")).toHaveCount(7);
    await expect(dayTab(creator.page, rideDate)).toHaveAccessibleName(
      `${dayName(rideDate)}, needs attention`,
    );
    await expect(dayTab(creator.page, rideDate)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const day = creator.page.getByRole("tabpanel", {
      name: dayName(rideDate),
      exact: true,
    });
    await expect(
      day.getByRole("heading", { name: dayName(rideDate), exact: true }),
    ).toBeVisible();
    await expect(day.getByText("2 rides", { exact: true })).toBeVisible();
    await expect(day.getByRole("listitem")).toHaveCount(2);
    // Each ride is one link: route, device-zone time, state and who acts next.
    await expect(day.getByRole("link")).toHaveCount(3);
    const outboundCard = day.getByRole("link", {
      name: /^Morning area → Activity area, 1:30 – 2:30\sAM, Needs driver\. No one is driving yet$/,
    });
    const returnCard = day.getByRole("link", {
      name: /^Activity area → Home area, 3:00 – 4:00\sPM, Needs driver\. No one is driving yet$/,
    });
    await expect(outboundCard).toHaveAttribute("href", `/app/rides/${rideId}`);
    await expect(returnCard).toBeVisible();
    await expect(returnCard.getByText(/· Return$/)).toBeVisible();
    await expect(outboundCard.getByText(/Return/)).toHaveCount(0);
    await expect(creator.page.getByText(/GMT|UTC|Denver/)).toHaveCount(0);
    await expect(
      day.getByText("101 Secret Pickup, side door", { exact: false }),
    ).toHaveCount(0);
    await captureState(creator.page, "schedule");
    await button(creator.page, "Next week").click();
    const nextWeek = shift(rideDate, 7);
    await expect(creator.page).toHaveURL(new RegExp(`from=${nextWeek}`));
    await expect(dayTab(creator.page, nextWeek)).toHaveAccessibleName(
      `${dayName(nextWeek)}, no rides`,
    );
    await expect(
      creator.page.getByRole("heading", { name: "Nothing on Sunday", exact: true }),
    ).toBeVisible();
    await expect(creator.page.getByRole("listitem")).toHaveCount(0);
    // Weeks that start or end on a skipped midnight still load: Tehran's clocks
    // went forward at 00:00 on 2021-03-22.
    tehran = await browser.newContext({
      timezoneId: "Asia/Tehran",
      storageState: await creator.context.storageState(),
    });
    const tehranPage = await tehran.newPage();
    for (const date of ["2021-03-15", "2021-03-22"]) {
      await visit(tehranPage, `/app/schedule?date=${date}`);
      await expect(days(tehranPage).getByRole("tab")).toHaveCount(7);
      await expect(dayTab(tehranPage, date)).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(
        tehranPage.getByRole("heading", { name: "Nothing on Monday", exact: true }),
      ).toBeVisible();
      // A day that is over cannot be planned for.
      await expect(
        tehranPage.getByRole("main").getByRole("link", { name: "Plan a ride" }),
      ).toHaveCount(0);
      await expect(tehranPage.locator('[role="alert"]')).toHaveCount(0);
    }
    await tehran.close();
    tehran = undefined;
    // A ride this far ahead asks nothing of its planner today.
    await visit(creator.page, "/app/attention");
    await expect(
      creator.page.getByRole("heading", { level: 1, name: "Today", exact: true }),
    ).toBeVisible();
    await expect(
      creator.page.getByText("Nothing needs you right now.", { exact: true }),
    ).toBeVisible();
    await expect(
      creator.page.getByText("Morning area", { exact: false }),
    ).toHaveCount(0);
    await visit(creator.page, rideUrl);
    // Use keyboard and a narrow screen for the final irreversible-in-app operation.
    await creator.page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        creator.page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      )
      .toBe(true);
    // The phone layout starts with the rare actions folded away under More.
    const more = button(creator.page, "More");
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await more.focus();
    await creator.page.keyboard.press("Enter");
    await expect(more).toHaveAttribute("aria-expanded", "true");
    const cancelByKeyboard = await cancelRide(creator.page);
    await cancelByKeyboard.focus();
    await creator.page.keyboard.press("Enter");
    await expectToast(creator.page, "Ride cancelled");
    await expect(
      creator.page.getByRole("dialog", { name: "Cancel ride", exact: true }),
    ).toHaveCount(0);
    await expect(badge(creator.page, "Cancelled")).toBeVisible();
    await expect(
      creator.page.getByText("This ride was cancelled", { exact: true }),
    ).toBeVisible();
    await refresh(creator.page);
    await expect(button(creator.page, "Cancel ride")).toHaveCount(0);
    await refresh(other.page);
    await expect(badge(other.page, "Cancelled")).toBeVisible();
    await expect(
      other.page.getByText("This ride was cancelled", { exact: true }),
    ).toBeVisible();
    await expect(button(other.page, "Change riders")).toHaveCount(0);
    await expect(button(other.page, "Join ride")).toHaveCount(0);
    await visit(coordinator.page, circleUrl);
    const removal = coordinator.page
      .getByRole("list", { name: "Families" })
      .getByRole("listitem")
      .filter({ hasText: "Invited browser family" });
    const removeFamily = await openAction(
      coordinator.page,
      "Remove Invited browser family",
      button(removal, "Remove"),
    );
    await removeFamily
      .getByLabel("Remove Invited browser family from R4 browser circle")
      .check();
    await button(removeFamily, "Remove family").click();
    await expectToast(coordinator.page, "Invited browser family removed");
    await expect(removal).toHaveCount(0);
    await refresh(other.page);
    await expect(
      other.page.getByRole("heading", { name: "Ride unavailable" }),
    ).toBeVisible();
    await refresh(secondPage);
    await expect(
      secondPage.getByRole("heading", { name: "Ride unavailable" }),
    ).toBeVisible();
    // A removed session also cannot replay its formerly authorized endpoint.
    await replay(enrollmentPost, other.context, "unavailable");
    await visit(creator.page, creatorFamily);
    await expect(
      creator.page.getByRole("heading", { name: "Creator browser family" }),
    ).toBeVisible();
  } finally {
    await Promise.all([
      creator.context.close(),
      other.context.close(),
      coordinator.context.close(),
      outsider.context.close(),
      independent.close(),
      tehran?.close(),
    ]);
  }
});


test("Schedule opens a dated planner and shares named routes only within the family", async ({
  browser,
}) => {
  const parent = await account(inDenver(browser), "schedule-planner");
  const other = await account(inDenver(browser), "schedule-other");
  const { page } = parent;
  // The Thursday and Saturday before the clocks go back, both still ahead.
  const thursday = shift(rideDate, -3);
  const friday = shift(rideDate, -2);
  const saturday = shift(rideDate, -1);
  const weekUrl = `/app/schedule?date=${thursday}`;
  const routeName = "School → Soccer";
  const locations = {
    From: "School",
    To: "Soccer",
    "Pickup address": "101 School Lane, east door",
    "Drop-off address": "202 Soccer Lane, north gate",
  };
  const planLink = (target) =>
    target.getByRole("tabpanel").getByRole("link", { name: "Plan a ride" });
  let phone;
  try {
    const parentFamily = await family(page, "Schedule parent family", "Parent");
    const otherFamily = await family(other.page, "Schedule other family", "Other parent");
    await addChild(other.page, "Schedule other child");
    await addChild(page, "Schedule rider");
    const circleUrl = await createCircle(page, "After-school circle");
    await joinCircle(parent, other, circleUrl, "After-school circle");

    await visit(page, weekUrl);
    await expect(days(page).getByRole("tab")).toHaveCount(7);
    // A day is chosen from the keyboard, and the planner opens on that day.
    const thursdayTab = dayTab(page, thursday);
    await expect(thursdayTab).toHaveAccessibleName(
      `${dayName(thursday)}, no rides`,
    );
    await expect(thursdayTab).toHaveAttribute("aria-selected", "true");
    const fridayTab = dayTab(page, friday);
    await fridayTab.focus();
    await expect(fridayTab).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(fridayTab).toHaveAttribute("aria-selected", "true");
    await expect(thursdayTab).toHaveAttribute("aria-selected", "false");
    await expect(
      page.getByRole("heading", { name: "Nothing on Friday", exact: true }),
    ).toBeVisible();
    await expect(planLink(page)).toHaveAttribute(
      "href",
      `/app/rides/new?date=${friday}`,
    );
    await thursdayTab.focus();
    await page.keyboard.press("Enter");
    await expect(thursdayTab).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("heading", { name: "Nothing on Thursday", exact: true }),
    ).toBeVisible();
    await planLink(page).focus();
    await expect(planLink(page)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/app/rides/new\\?date=${thursday}$`));
    await expandDetails(page);
    await expect(field(page, "Date")).toHaveValue(thursday);
    await expect(field(page, "Pickup")).toHaveValue("");
    await expect(field(page, "Drop-off")).toHaveValue("");
    // Saving a route is offered once the ride has both of its places.
    await expect(button(page, "Save this route")).toHaveCount(0);
    await fillRide(page, {
      from: locations.From,
      to: locations.To,
      pickup: locations["Pickup address"],
      dropoff: locations["Drop-off address"],
      starts: "15:00",
      ends: "15:40",
    });
    await expect(field(page, "Schedule rider")).toBeChecked();

    const saveDialog = await openAction(page, "Save this route");
    await saveDialog.getByLabel("Route name").fill(routeName);
    await button(saveDialog, "Save route").click();
    await expectToast(page, "Route saved");
    await expect(saveDialog).toHaveCount(0);
    await expect(field(page, "Date")).toHaveValue(thursday);
    await expect(field(page, "Pickup")).toHaveValue("15:00");
    await expect(field(page, "Drop-off")).toHaveValue("15:40");
    await expect(field(page, "Schedule rider")).toBeChecked();
    await button(page, "Create ride").click();
    await created(page);
    await expect(
      page.getByRole("heading", { name: routeName, level: 1 }),
    ).toBeVisible();
    // The ride shows in the device's own time, with no timezone to read.
    await expect(page.getByText(/· 3:00 – 3:40\sPM$/)).toBeVisible();
    await expect(page.getByText(/GMT|UTC|Denver/)).toHaveCount(0);

    phone = await browser.newContext({
      hasTouch: true,
      viewport: { width: 320, height: 750 },
      timezoneId: zone,
      storageState: await parent.context.storageState(),
    });
    const phonePage = await phone.newPage();
    await visit(phonePage, weekUrl);
    await expect(dayTab(phonePage, thursday)).toHaveAccessibleName(
      `${dayName(thursday)}, needs attention`,
    );
    await expect(days(phonePage).getByRole("tab")).toHaveCount(7);
    for (const day of await days(phonePage).getByRole("tab").all()) {
      const bounds = await day.boundingBox();
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
    }
    expect(
      await phonePage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await dayTab(phonePage, saturday).tap();
    await expect(dayTab(phonePage, saturday)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await planLink(phonePage).tap();
    await expect(phonePage).toHaveURL(
      new RegExp(`/app/rides/new\\?date=${saturday}$`),
    );
    await expandDetails(phonePage);
    const phoneField = (label) => field(phonePage, label);
    await expect(phoneField("Date")).toHaveValue(saturday);
    const [routeId] = await phoneField("Saved route").selectOption({ label: routeName });
    for (const [label, value] of Object.entries(locations))
      await expect(phoneField(label)).toHaveValue(value);
    await expect(phoneField("Date")).toHaveValue(saturday);
    await expect(phonePage.getByLabel(/time ?zone/i)).toHaveCount(0);
    await expect(phoneField("Pickup")).toHaveValue("");

    const changedPickup = "101 School Lane, west door";
    await phoneField("Pickup address").fill(changedPickup);
    await phoneField("Pickup").fill("19:15");
    await phoneField("Drop-off").fill("20:00");
    await expect(phoneField("Schedule rider")).toBeChecked();
    await expect(phoneField("Schedule other family")).toBeChecked();
    await button(phonePage, "Create ride").click();
    await created(phonePage);
    await expect(phonePage.getByText(changedPickup, { exact: true })).toBeVisible();
    const rideId = new URL(phonePage.url()).pathname.split("/").at(-1);
    const response = await authenticatedRpc(phonePage, "ride_offer", { p_id: rideId });
    expect(response.ok()).toBe(true);
    const [ride] = await response.json();
    // 7:15 PM on the device's clock is saved in the device's timezone.
    expect(ride.timezone).toBe(zone);
    expect(new Date(ride.starts_at).toISOString()).toBe(`${rideDate}T01:15:00.000Z`);

    const familyId = new URL(parentFamily).pathname.split("/").at(-1);
    const otherFamilyId = new URL(otherFamily).pathname.split("/").at(-1);
    const lookup = async (person) => {
      const token = await sessionToken(person.context());
      const filters = new URLSearchParams({
        family_id: `eq.${familyId}`,
        id: `eq.${routeId}`,
        select: "name,pickup,destination",
      });
      const rows = await person.request.get(`http://localhost:55321/rest/v1/saved_routes?${filters}`, {
        headers: {
          apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
          authorization: `Bearer ${token}`,
        },
      });
      expect(rows.ok()).toBe(true);
      return rows.json();
    };
    expect(await lookup(phonePage)).toEqual([{
      name: routeName,
      pickup: locations["Pickup address"],
      destination: locations["Drop-off address"],
    }]);
    await visit(other.page, `${phonePage.url()}?family=${otherFamilyId}`);
    await expect(other.page.getByRole("heading", { name: routeName, level: 1 })).toBeVisible();
    await expect(other.page.getByText(changedPickup, { exact: true })).toHaveCount(0);
    expect(await lookup(other.page)).toEqual([]);
    const otherRouteList = other.page.waitForResponse((result) =>
      new URL(result.url()).pathname.endsWith("/saved_routes"),
    );
    await visit(other.page, "/app/rides/new");
    expect((await otherRouteList).ok()).toBe(true);
    await expect(field(other.page, "From")).toBeVisible();
    await expect(other.page.getByLabel("Saved route")).toHaveCount(0);
  } finally {
    await Promise.all([parent.context.close(), other.context.close(), phone?.close()]);
  }
});
