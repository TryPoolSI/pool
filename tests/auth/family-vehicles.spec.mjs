import { expect, test } from "@playwright/test";
import { upcomingRideStart, hoursFrom } from "../../scripts/auth-test-dates.mjs";
import { account, family, invitation, openAndCheck, visit } from "./helpers.mjs";
import { authenticatedRpc } from "./rpc.mjs";

const button = (page, name) => page.getByRole("button", { name, exact: true });
const familyId = (url) => new URL(url).pathname.split("/").at(-1);
const vehicleSave = "**/rest/v1/rpc/save_vehicle";

async function rpc(page, name, args) {
  const response = await authenticatedRpc(page, name, args);
  expect(response.ok(), name).toBe(true);
  return response.json();
}

async function saveCar(page, label) {
  await page.getByLabel("Vehicle label", { exact: true }).fill(label);
  await page.getByLabel("Passenger seats, excluding you", { exact: true }).fill("3");
  await button(page, "Save vehicle").click();
}

test("My family skips car setup for a visit and clears the prompt immediately after saving", async ({ browser }) => {
  const owner = await account(browser, "vehicle-owner");
  const guardian = await account(browser, "vehicle-guardian");
  try {
    const dashboard = await family(owner.page, "Car setup family", "Car owner");
    const invite = await invitation(owner.page, guardian.email, "guardian");
    await openAndCheck(guardian.page, invite);
    await guardian.page.getByLabel("Your display name", { exact: true }).fill("Co-guardian");
    await guardian.page.getByLabel("I explicitly accept this family guardian membership.").check();
    await button(guardian.page, "Accept invitation").click();
    await expect(guardian.page).toHaveURL(dashboard);

    const prompt = button(owner.page, "Add your car");
    await visit(owner.page, dashboard);
    await expect(prompt).toBeVisible();
    await button(owner.page, "Skip").click();
    await expect(prompt).toHaveCount(0);
    await owner.page.getByRole("link", { name: "My family", exact: true }).waitFor();
    await owner.page.getByRole("link", { name: "Home", exact: true }).click();
    await owner.page.getByRole("link", { name: "My family", exact: true }).click();
    await expect(prompt).toBeVisible();

    await prompt.click();
    await owner.page.route(vehicleSave, (route) => route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ code: "PT400", message: "validation" }),
    }), { times: 1 });
    await saveCar(owner.page, "Usual car");
    await expect(owner.page.getByRole("alert")).toContainText("Check the vehicle");
    await expect(owner.page.getByLabel("Vehicle label", { exact: true })).toHaveValue("Usual car");

    const refreshGate = Promise.withResolvers();
    const availability = "**/rest/v1/rpc/family_has_active_vehicle";
    await owner.page.route(availability, async (route) => {
      await refreshGate.promise;
      await route.continue();
    }, { times: 1 });
    try {
      const refresh = owner.page.waitForRequest(availability);
      await button(owner.page, "Save vehicle").click();
      await refresh;
      await expect(owner.page.getByRole("status", { name: "", exact: true }).filter({ hasText: /^Car added$/ })).toBeVisible();
      await expect(prompt).toHaveCount(0);
      await expect(button(owner.page, "Skip")).toHaveCount(0);
      await expect(owner.page.getByLabel("Vehicle label", { exact: true })).toHaveCount(0);
      await expect(owner.page).toHaveURL(dashboard);
    } finally {
      refreshGate.resolve();
    }

    await visit(guardian.page, "/app/vehicles");
    await expect(guardian.page.getByText("No registered vehicles yet.")).toBeVisible();
    const available = guardian.page.waitForResponse((response) =>
      response.url().endsWith("/rpc/family_has_active_vehicle") && response.ok(),
    );
    await visit(guardian.page, dashboard);
    expect(await (await available).json()).toBe(true);
    await expect(button(guardian.page, "Add your car")).toHaveCount(0);
  } finally {
    await Promise.all([owner.context.close(), guardian.context.close()]);
  }
});

test("a proposed-only driver can add and change a car, then change the confirmed car with fresh approval", async ({ browser }) => {
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
    await visit(owner.page, rideUrl);
    await button(owner.page, "Add a car").click();
    await saveCar(owner.page, "Guardian's car");
    const nominee = owner.page.getByLabel("Driver and registered vehicle", { exact: true });
    await expect(nominee.locator("option:checked")).toContainText("Guardian's car");
    await nominee.selectOption({ label: "Ride driver · Driver's usual car · 3 passenger seats" });
    await owner.page.getByLabel("I nominate this adult and vehicle for this ride’s current riders and plan.").check();
    await button(owner.page, "Nominate driver").click();
    await expect(owner.page.getByText("Ride driver · Driver's usual car", { exact: true }).first()).toBeVisible();

    await visit(driver.page, rideUrl);
    await expect(driver.page.getByText("Only the minimal driver proposal", { exact: false })).toBeVisible();
    const requestNewCar = async (label) => {
      await button(driver.page, "Add a car").click();
      await saveCar(driver.page, label);
      const selection = driver.page.getByLabel("Different car", { exact: true });
      await expect(selection.locator("option:checked")).toContainText(label);
      await driver.page.getByLabel("I request this car for the ride. The driver and every participating family must approve again.").check();
      await button(driver.page, "Request car change").click();
      await expect(driver.page.getByText(`Ride driver · ${label}`, { exact: true })).toBeVisible();
    };
    const approveCar = async (label) => {
      await driver.page.getByLabel(/^I can accommodate all/).check();
      await driver.page.getByLabel(/^I explicitly accept driving this ride/).check();
      await button(driver.page, "Accept as driver").click();
      await expect(driver.page.getByText("Driver acceptance: Accepted", { exact: false })).toBeVisible();
      await visit(owner.page, rideUrl);
      await owner.page.getByLabel("Ride child", { exact: true }).check();
      await owner.page.getByLabel(/^I explicitly consent to this driver/).check();
      await button(owner.page, "Approve driver for selected children").click();
      await expect.poll(async () => {
        const [state] = await rpc(owner.page, "driver_status", { p_ride_id: ride });
        return [state.proposal_status, state.vehicle_label];
      }).toEqual(["confirmed", label]);
    };
    await requestNewCar("Borrowed car");
    await approveCar("Borrowed car");

    await visit(driver.page, rideUrl);
    await requestNewCar("Confirmed ride alternate");
    await expect(driver.page.getByText("Current driver: Ride driver · Borrowed car", { exact: true })).toBeVisible();
    await expect(driver.page.getByText("Driver acceptance: Required", { exact: false })).toBeVisible();
    await approveCar("Confirmed ride alternate");
    await visit(driver.page, rideUrl);
    await expect(driver.page.getByText("Ride driver · Confirmed ride alternate", { exact: true })).toBeVisible();
  } finally {
    await Promise.all([owner.context.close(), driver.context.close()]);
  }
});
