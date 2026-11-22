import { expect, test } from "@playwright/test";
import { upcomingRideStart, hoursFrom } from "../../scripts/auth-test-dates.mjs";
import {
  account,
  closeAction,
  expectToast,
  family,
  invitation,
  joinInvitation,
  openAction,
  openAndCheck,
  visit,
} from "./helpers.mjs";
import { authenticatedRpc } from "./rpc.mjs";

const button = (page, name) => page.getByRole("button", { name, exact: true });
const familyId = (url) => new URL(url).pathname.split("/").at(-1);
const vehicleSave = "**/rest/v1/rpc/save_vehicle";
const availability = "**/rest/v1/rpc/family_has_active_vehicle";
const ownCarsRead = (url) =>
  url.pathname === "/rest/v1/vehicles" &&
  url.searchParams.get("retired_at") === "is.null";
const noCarYet = "Add the car you usually drive so you can offer to drive.";
const carRow = (page, label) =>
  page.getByRole("group", { name: label, exact: true });
const seats = (scope, count) =>
  scope
    .getByRole("radiogroup", { name: "Seats for passengers", exact: true })
    .getByRole("radio", { name: count, exact: true });

async function rpc(page, name, args) {
  const response = await authenticatedRpc(page, name, args);
  expect(response.ok(), name).toBe(true);
  return response.json();
}

// Fills the car form inside `scope` (a sheet) and presses "Add car".
async function saveCar(scope, label) {
  await scope.getByLabel("Car name", { exact: true }).fill(label);
  await seats(scope, "3").click();
  await expect(seats(scope, "3")).toBeChecked();
  await button(scope, "Add car").click();
}

test("a new family can save its first car while the family vehicle check is unavailable", async ({ browser }) => {
  const { context, page } = await account(browser, "vehicle-before-migration");
  try {
    await page.route(availability, (route) => route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ code: "PGRST202", message: "Function not found in the schema cache" }),
    }));
    const dashboard = await family(page, "New car setup family", "Car owner");
    await expect(page.getByText(noCarYet, { exact: true })).toBeVisible();
    const sheet = await openAction(page, "Add a car");
    await saveCar(sheet, "First family car");
    // The sheet closes on the saved car and the page stays on My family.
    await expectToast(page, "First family car added");
    await expect(sheet).toHaveCount(0);
    await expect(carRow(page, "First family car")).toContainText(
      "3 passenger seats",
    );
    await expect(page.getByText(noCarYet, { exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(dashboard);

    const vehiclesLoaded = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return ownCarsRead(url) && response.ok();
    });
    await page.reload();
    expect(await (await vehiclesLoaded).json()).toHaveLength(1);
    await expect(page).toHaveURL(dashboard);
    await expect(carRow(page, "First family car")).toBeVisible();
    await expect(page.getByText(noCarYet, { exact: true })).toHaveCount(0);
    await expect(button(page, "Try again")).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);

    await visit(page, "/app/vehicles");
    await expect(
      page.getByRole("heading", { level: 1, name: "Your cars" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "First family car" })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("My family keeps the Cars card until a car is saved, then shows it at once", async ({ browser }) => {
  const owner = await account(browser, "vehicle-owner");
  const guardian = await account(browser, "vehicle-guardian");
  try {
    const dashboard = await family(owner.page, "Car setup family", "Car owner");
    const invite = await invitation(owner.page, guardian.email, "guardian");
    await openAndCheck(guardian.page, invite);
    await joinInvitation(guardian.page, "Car setup family", {
      display: "Co-guardian",
    });
    await expect(guardian.page).toHaveURL(dashboard);

    // Cars is a card on My family, not a prompt: there is nothing to skip, and
    // it is still there after leaving the page and coming back.
    await visit(owner.page, dashboard);
    const addCar = button(owner.page, "Add a car");
    await expect(addCar).toBeVisible();
    await expect(owner.page.getByText(noCarYet, { exact: true })).toBeVisible();
    await expect(button(owner.page, "Skip")).toHaveCount(0);
    await owner.page.getByRole("link", { name: "My family", exact: true }).waitFor();
    await owner.page.getByRole("link", { name: "Home", exact: true }).click();
    await expect(owner.page.getByRole("heading", { level: 1 })).toHaveText("Home");
    await owner.page.getByRole("link", { name: "My family", exact: true }).click();
    await expect(addCar).toBeVisible();
    await expect(owner.page.getByText(noCarYet, { exact: true })).toBeVisible();

    const sheet = await openAction(owner.page, "Add a car");
    await owner.page.route(vehicleSave, (route) => route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ code: "PT400", message: "validation" }),
    }), { times: 1 });
    await saveCar(sheet, "Usual car");
    // A refused save keeps the sheet open with what was typed.
    await expect(sheet.getByRole("alert")).toContainText("doesn’t fit");
    await expect(sheet.getByLabel("Car name", { exact: true })).toHaveValue("Usual car");
    await expect(seats(sheet, "3")).toBeChecked();
    await expect(owner.page.getByTestId("toast")).toHaveCount(0);

    // The confirmation does not wait for the list to be read again.
    const refreshGate = Promise.withResolvers();
    await owner.page.route(ownCarsRead, async (route) => {
      await refreshGate.promise;
      await route.continue();
    }, { times: 1 });
    try {
      const refresh = owner.page.waitForRequest((request) =>
        ownCarsRead(new URL(request.url())),
      );
      await button(sheet, "Add car").click();
      await refresh;
      await expectToast(owner.page, "Usual car added");
      await expect(sheet).toHaveCount(0);
      await expect(owner.page.getByLabel("Car name", { exact: true })).toHaveCount(0);
      await expect(owner.page).toHaveURL(dashboard);
    } finally {
      refreshGate.resolve();
    }
    await expect(carRow(owner.page, "Usual car")).toContainText(
      "3 passenger seats",
    );
    await expect(owner.page.getByText(noCarYet, { exact: true })).toHaveCount(0);

    // Another guardian's car stays private; the family-wide check only changes
    // how the empty Cars card is worded.
    await visit(guardian.page, "/app/vehicles");
    await expect(
      guardian.page.getByRole("heading", { name: "No cars yet", exact: true }),
    ).toBeVisible();
    await expect(guardian.page.getByText("Usual car")).toHaveCount(0);
    const available = guardian.page.waitForResponse((response) =>
      response.url().endsWith("/rpc/family_has_active_vehicle") && response.ok(),
    );
    await visit(guardian.page, dashboard);
    expect(await (await available).json()).toBe(true);
    await expect(
      guardian.page.getByText(
        "Another guardian has added a car. Add yours if you drive too.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(guardian.page.getByText(noCarYet, { exact: true })).toHaveCount(0);
    await expect(carRow(guardian.page, "Usual car")).toHaveCount(0);
  } finally {
    await Promise.all([owner.context.close(), guardian.context.close()]);
  }
});

test("a driver adds and switches cars in one step, before and after saying yes, and no family approves the car", async ({ browser }) => {
  const owner = await account(browser, "ride-car-owner");
  const driver = await account(browser, "ride-car-driver");
  try {
    const ownerFamily = familyId(await family(owner.page, "Ride car family", "Ride guardian"));
    const driverFamily = familyId(await family(driver.page, "Ride driver family", "Ride driver"));
    const circle = await rpc(owner.page, "create_circle", {
      p_family_id: ownerFamily, p_name: "Car change circle",
    });
    const [invite] = await rpc(owner.page, "create_invitation", {
      p_kind: "circle", p_scope_id: circle, p_email: driver.email,
    });
    await rpc(driver.page, "accept_invitation", {
      p_kind: "circle", p_token: invite.token, p_family_id: driverFamily,
      p_display_name: "Ride driver",
    });
    const child = await rpc(owner.page, "save_own_child", {
      p_id: crypto.randomUUID(), p_family_id: ownerFamily, p_display_name: "Ride child",
      p_seat_requirement: "standard", p_revision: 0,
    });
    await rpc(driver.page, "save_vehicle", {
      p_id: crypto.randomUUID(), p_label: "Driver's usual car",
      p_passenger_seats: 3, p_version: 0, p_retire: false,
    });
    const start = upcomingRideStart();
    const ride = await rpc(owner.page, "create_ride", {
      p_id: crypto.randomUUID(), p_family_id: ownerFamily, p_circle_id: circle,
      p_pickup_summary: "Car test pickup", p_destination_summary: "Car test drop-off",
      p_pickup: "Private pickup", p_destination: "Private drop-off",
      p_direction: "outbound", p_timezone: "UTC",
      p_starts_at: hoursFrom(start, 0), p_ends_at: hoursFrom(start, 1),
      p_child_ids: [child], p_invited_family_ids: [],
    });
    const rideUrl = `/app/rides/${ride}`;
    const driverStatus = async () => {
      const [state] = await rpc(owner.page, "driver_status", { p_ride_id: ride });
      return state;
    };
    const driverCard = (page) =>
      page
        .getByRole("main")
        .locator("div")
        .filter({ has: page.getByRole("heading", { name: "Driver", exact: true }) })
        .last();

    // The guardian adds a car from the ride and can offer it straight away.
    await visit(owner.page, rideUrl);
    await expect(driverCard(owner.page)).toContainText("No driver yet");
    const addOwn = await openAction(owner.page, "Add your car", "Add a car to drive");
    await saveCar(addOwn, "Guardian's car");
    await expectToast(owner.page, "Guardian's car added");
    await expect(addOwn).toHaveCount(0);
    const offer = await openAction(owner.page, "I’ll drive");
    await expect(offer.getByText("You’ll drive the Guardian's car.")).toBeVisible();
    await closeAction(owner.page, "I’ll drive");
    // The guardian asks the other adult instead.
    const ask = await openAction(owner.page, "Ask someone else");
    await expect(
      ask.getByText("Ride driver would drive the Driver's usual car."),
    ).toBeVisible();
    await button(ask, "Ask Ride to drive").click();
    await expectToast(owner.page, "Request sent");
    await expect(ask).toHaveCount(0);
    await expect(driverCard(owner.page)).toContainText("Ride driver was asked to drive");
    await expect(driverCard(owner.page)).toContainText("Driver's usual car");

    // A driver from outside the riding families sees only the request.
    await visit(driver.page, rideUrl);
    await expect(
      driver.page.getByText(
        "You’ll see the addresses and who’s riding once you’re the driver.",
      ),
    ).toBeVisible();
    await expect(driver.page.getByText("Private pickup")).toHaveCount(0);
    await expect(driver.page.getByText("Ride child")).toHaveCount(0);
    await expect(
      driver.page.getByRole("heading", { name: "Can you drive this ride?" }),
    ).toBeVisible();
    await expect(
      driver.page.getByText("1 rider in your Driver's usual car."),
    ).toBeVisible();

    // The driver's own yes goes with the car they choose, so the switch is
    // done in one step. The families see the new car; nobody approves it.
    const badge = (page, label) =>
      page
        .getByRole("heading", { level: 1 })
        .locator("xpath=../..")
        .getByText(label, { exact: true });
    const switchCar = async (label, spare) => {
      await visit(driver.page, rideUrl);
      const change = await openAction(driver.page, "Use a different car");
      // Only cars that are not already on this ride are offered.
      if (spare)
        await expect(button(change, `Use the ${spare}`)).toBeVisible();
      else
        await expect(
          change.getByText(
            "You don’t have another car with a seat for every rider. Add one to switch.",
          ),
        ).toBeVisible();
      await button(change, "Add another car").click();
      await saveCar(change, label);
      // The car just added is the one chosen.
      if (spare)
        await expect(
          change.getByLabel("Car", { exact: true }).locator("option:checked"),
        ).toContainText(label);
      await expect(
        change.getByText(
          spare
            ? "The families on this ride will see the new car."
            : "You’re the driver as soon as you tap. The families on this ride are told.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(change.getByRole("checkbox")).toHaveCount(0);
      await button(change, `Use the ${label}`).click();
      await expectToast(driver.page, spare ? "Car changed" : "You’re driving");
      await expect(change).toHaveCount(0);
      await expect
        .poll(async () => {
          const state = await driverStatus();
          return [state.coverage, state.proposal_status, state.vehicle_label];
        })
        .toEqual(["confirmed", "confirmed", label]);
      await expect(badge(driver.page, "You’re driving")).toBeVisible();
      await expect(driverCard(driver.page)).toContainText("You’re driving");
      await expect(driverCard(driver.page)).toContainText(label);
      await expect(driverCard(driver.page)).not.toContainText("asked to switch");
    };
    // The family is shown the car and asked nothing.
    const familySees = async (label) => {
      await visit(owner.page, rideUrl);
      await expect(badge(owner.page, "Covered")).toBeVisible();
      await expect(driverCard(owner.page)).toContainText("Ride driver is driving");
      await expect(driverCard(owner.page)).toContainText(label);
      await expect(
        owner.page.getByRole("region", { name: "Your next step", exact: true }),
      ).toHaveCount(0);
      await expect(
        owner.page.getByRole("button", { name: /Approve/ }),
      ).toHaveCount(0);
      await expect(
        owner.page.getByRole("heading", { name: /Approve/ }),
      ).toHaveCount(0);
    };
    // Asked but not yet answered: choosing the car is the driver's yes.
    await switchCar("Borrowed car");
    await expect(
      driver.page.getByRole("heading", { name: "Can you drive this ride?" }),
    ).toHaveCount(0);
    await expect(driver.page.getByText("Private pickup")).toBeVisible();
    await familySees("Borrowed car");

    // Already the driver: the car changes at once and the old one is released.
    await switchCar("Confirmed ride alternate", "Driver's usual car");
    await expect(driverCard(driver.page)).not.toContainText("Borrowed car");
    await familySees("Confirmed ride alternate");
    await expect(driverCard(owner.page)).not.toContainText("Borrowed car");
    // Home tells the family the car changed, not that someone took over.
    await visit(owner.page, "/app");
    const news = owner.page.getByRole("region", {
      name: "What changed",
      exact: true,
    });
    await expect(news.getByRole("link")).toHaveAccessibleName(
      /^Ride switched cars\. .+ · Car test pickup → Car test drop-off$/,
    );
    await expect(news.getByText(/took over driving/)).toHaveCount(0);
    // The car that left the ride can be edited again; the one on it cannot.
    await visit(driver.page, "/app/vehicles");
    const onRide = await openAction(
      driver.page,
      "Edit Confirmed ride alternate",
      button(carRow(driver.page, "Confirmed ride alternate"), "Edit"),
    );
    await seats(onRide, "2").click();
    await button(onRide, "Save changes").click();
    await expect(onRide.getByRole("alert")).toHaveText(
      "This car is on a ride. Use a different car for that ride first.",
    );
  } finally {
    await Promise.all([owner.context.close(), driver.context.close()]);
  }
});
