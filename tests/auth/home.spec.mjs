import { Buffer } from "node:buffer";
import { test, expect } from "@playwright/test";
import { account } from "./helpers.mjs";
import { authenticatedRpc, sessionToken } from "./rpc.mjs";

async function rpc(person, name, args) {
  const response = await authenticatedRpc(person.page, name, args);
  expect(response.ok(), `${name}: ${await response.text()}`).toBe(true);
  return response.json();
}

async function createFamily(person, name) {
  return rpc(person, "create_family", { p_name: name, p_display_name: name });
}

async function createCircle(person, family, name) {
  return rpc(person, "create_circle", { p_family_id: family, p_name: name });
}

async function joinCircle(owner, circle, invitee, family) {
  const [{ token }] = await rpc(owner, "create_invitation", {
    p_kind: "circle",
    p_scope_id: circle,
    p_email: invitee.email,
  });
  await rpc(invitee, "accept_invitation", {
    p_kind: "circle",
    p_token: token,
    p_family_id: family,
    p_display_name: "Home test guardian",
  });
}

async function createChild(person, family, name, restraint = "standard") {
  return rpc(person, "save_own_child", {
    p_id: crypto.randomUUID(),
    p_family_id: family,
    p_display_name: name,
    p_seat_requirement: restraint,
    p_revision: 0,
  });
}

async function registerDriver(person, family) {
  const token = await sessionToken(person.context);
  const { sub } = JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
  const vehicle = await rpc(person, "save_vehicle", {
    p_id: crypto.randomUUID(),
    p_label: "Home test car",
    p_passenger_seats: 3,
    p_version: 0,
    p_retire: false,
  });
  return {
    p_driver_id: sub,
    p_driver_family_id: family,
    p_vehicle_id: vehicle,
    p_vehicle_version: 1,
  };
}

test("Home shows joined rides without confirmed coverage across circles", async ({
  browser,
}) => {
  const member = await account(browser, "home-member");
  try {
    const other = await account(browser, "home-other");
    try {
      const { page } = member;
      await page.setViewportSize({ width: 320, height: 844 });
      const coverage = page.getByRole("region", { name: "Driver coverage" });
      await expect(
        page.getByRole("heading", { name: "Profile" }),
      ).toBeVisible();
      await expect(coverage).toHaveCount(0);

      const family = await createFamily(member, "Home family");
      const otherFamily = await createFamily(other, "Other family");
      const north = await createCircle(member, family, "North circle");
      const south = await createCircle(member, family, "South circle");
      const privateCircle = await createCircle(
        other,
        otherFamily,
        "Private circle",
      );
      await joinCircle(member, north, other, otherFamily);
      await joinCircle(member, south, other, otherFamily);
      const child = await createChild(member, family, "Home child");
      const otherChild = await createChild(other, otherFamily, "Other child");
      const memberDriver = await registerDriver(member, family);
      const otherDriver = await registerDriver(other, otherFamily);

      await page.goto("/app");
      await expect(coverage).toContainText(
        "No joined rides need a driver in the next 7 days.",
      );

      const now = Date.now();
      async function ride(
        person,
        rideFamily,
        circle,
        rider,
        label,
        hours,
        invite = [],
      ) {
        const starts = now + hours * 3600_000;
        return rpc(person, "create_ride", {
          p_id: crypto.randomUUID(),
          p_family_id: rideFamily,
          p_circle_id: circle,
          p_pickup_summary: label,
          p_destination_summary: "Practice",
          p_pickup: "Private pickup address",
          p_destination: "Private practice address",
          p_direction: "outbound",
          p_starts_at: new Date(starts).toISOString(),
          p_ends_at: new Date(starts + 3600_000).toISOString(),
          p_timezone: "America/Denver",
          p_child_ids: [rider],
          p_invited_family_ids: invite,
        });
      }

      // Create in reverse pickup order and join the later ride with both families.
      const later = await ride(member, family, north, child, "Later pickup", 6, [
        otherFamily,
      ]);
      await rpc(other, "respond_to_ride_invitation", {
        p_ride_id: later,
        p_family_id: otherFamily,
        p_revision: 1,
        p_accept: true,
        p_child_ids: [otherChild],
      });
      const early = await ride(member, family, north, child, "Early pickup", 4);
      const pending = await ride(member, family, south, child, "Pending pickup", 8);
      const cancelled = await ride(
        member, family, north, child, "Cancelled pickup", 10,
      );
      await rpc(member, "cancel_ride", {
        p_ride_id: cancelled,
        p_family_id: family,
        p_revision: 1,
      });
      await ride(member, family, north, child, "Past pickup", -0.5);
      await ride(member, family, north, child, "Next week pickup", 192);
      await ride(other, otherFamily, north, otherChild, "Invited pickup", 12, [
        family,
      ]);
      await ride(other, otherFamily, north, otherChild, "Unjoined pickup", 14);
      await ride(other, otherFamily, privateCircle, otherChild, "Private pickup", 16);

      const proposal = await rpc(member, "propose_driver", {
        p_id: crypto.randomUUID(),
        p_ride_id: pending,
        p_family_id: family,
        p_revision: 1,
        ...memberDriver,
      });

      const offersUrl = "**/rest/v1/rpc/ride_offers?*";
      await page.route(offersUrl, (route) => route.abort(), { times: 1 });
      await page.reload();
      await expect(coverage.getByRole("alert")).toContainText(
        "Driver coverage could not be loaded.",
      );
      await expect(
        page.getByRole("link", { name: "Accept an invitation" }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "North circle" })).toBeVisible();
      await expect(coverage).not.toContainText("No joined rides need a driver");

      const offerDetailsUrl = "**/rest/v1/rpc/drive_offer_details";
      await page.route(offerDetailsUrl, (route) =>
        route.fulfill({
          status: 404,
          json: {
            code: "PGRST202",
            message: "Could not find the function in the schema cache",
          },
        }),
      );
      await coverage
        .getByRole("button", { name: "Retry driver coverage" })
        .click();

      const northRides = coverage.getByRole("group", { name: "North circle" });
      const southRides = coverage.getByRole("group", { name: "South circle" });
      const earlyLink = northRides.getByRole("link", {
        name: "Early pickup → Practice",
      });
      await expect(earlyLink).toHaveAttribute("href", `/app/rides/${early}`);
      await expect(northRides.getByRole("link")).toHaveText([
        "Early pickup → Practice",
        "Later pickup → Practice",
      ]);
      await expect(northRides.getByText("Needs a driver")).toHaveCount(2);
      await expect(northRides.getByText(/^Pickup: .*GMT-/)).toHaveCount(2);
      await expect(southRides.getByRole("link")).toHaveText([
        "Pending pickup → Practice",
      ]);
      await expect(southRides).toContainText("Driver not confirmed");
      await expect(coverage.getByRole("listitem")).toHaveCount(3);
      await expect(coverage.getByRole("alert")).toHaveCount(0);
      await expect(
        coverage.getByRole("button", { name: "I can drive" }),
      ).toHaveCount(0);
      await page.unroute(offerDetailsUrl);
      await expect(page.getByRole("link", { name: "Private circle" })).toHaveCount(
        0,
      );
      await expect(
        coverage.getByRole("link", { name: "Open Schedule" }),
      ).toHaveAttribute("href", "/app/schedule");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);

      const reply = { p_id: proposal, p_revision: 2 };
      await rpc(member, "accept_driver_proposal", {
        ...reply,
        p_available_seats: 3,
        p_restraints: true,
      });
      expect(
        await rpc(member, "consent_for_own_children", {
          ...reply,
          p_family_id: family,
          p_child_ids: [child],
        }),
      ).toBe("confirmed");
      await page.getByRole("button", { name: "Refresh current data" }).click();
      await expect(southRides).toHaveCount(0);
      await expect(
        northRides.getByRole("button", { name: "I can drive" }),
      ).toHaveCount(2);

      const [assignment] = await rpc(member, "driver_status", {
        p_ride_id: pending,
      });
      await rpc(member, "request_replacement", {
        p_id: crypto.randomUUID(),
        p_ride_id: pending,
        p_family_id: family,
        p_revision: assignment.ride_revision,
        p_mode: "optional_swap",
        p_original_assignment_id: assignment.current_assignment_id,
        p_original_assignment_revision: assignment.current_assignment_revision,
        p_deadline: assignment.starts_at,
        ...otherDriver,
      });
      await page.reload();
      await expect(northRides.getByRole("link")).toHaveCount(2);
      await expect(southRides).toHaveCount(0);
    } finally {
      await other.context.close();
    }
  } finally {
    await member.context.close();
  }
});

test("Home offers driving with one acceptance and separate guardian approval", async ({
  browser,
}) => {
  const driver = await account(browser, "volunteer");
  const guardian = await account(browser, "approver");
  try {
    const driverFamily = await createFamily(driver, "Volunteer family");
    const guardianFamily = await createFamily(guardian, "Approver family");
    const circle = await createCircle(driver, driverFamily, "Practice circle");
    await joinCircle(driver, circle, guardian, guardianFamily);
    const driverChild = await createChild(driver, driverFamily, "Volunteer child", "booster");
    const extraChild = await createChild(driver, driverFamily, "Extra rider");
    const guardianChild = await createChild(guardian, guardianFamily, "Approver child", "child-seat");
    const driverCar = await registerDriver(driver, driverFamily);
    const guardianCar = await registerDriver(guardian, guardianFamily);
    const van = await rpc(driver, "save_vehicle", {
      p_id: crypto.randomUUID(),
      p_label: "Practice van",
      p_passenger_seats: 4,
      p_version: 0,
      p_retire: false,
    });
    await rpc(driver, "save_vehicle", {
      p_id: crypto.randomUUID(),
      p_label: "One-seat car",
      p_passenger_seats: 1,
      p_version: 0,
      p_retire: false,
    });

    const now = Date.now();
    async function joinedRide(label, hours, ownChildren = [driverChild]) {
      const starts = now + hours * 3600_000;
      const ride = await rpc(driver, "create_ride", {
        p_id: crypto.randomUUID(),
        p_family_id: driverFamily,
        p_circle_id: circle,
        p_pickup_summary: label,
        p_destination_summary: "Practice",
        p_pickup: "Private pickup address",
        p_destination: "Private practice address",
        p_direction: "outbound",
        p_starts_at: new Date(starts).toISOString(),
        p_ends_at: new Date(starts + 3600_000).toISOString(),
        p_timezone: "America/Denver",
        p_child_ids: ownChildren,
        p_invited_family_ids: [guardianFamily],
      });
      await rpc(guardian, "respond_to_ride_invitation", {
        p_ride_id: ride,
        p_family_id: guardianFamily,
        p_revision: 1,
        p_accept: true,
        p_child_ids: [guardianChild],
      });
      return ride;
    }
    const ride = await joinedRide("Two-rider pickup", 4);
    const crowded = await joinedRide("Three-rider pickup", 8, [driverChild, extraChild]);
    const contested = await joinedRide("Contested pickup", 12);
    const simultaneous = await joinedRide("Simultaneous pickup", 16);

    const card = (person, label) =>
      person.page.getByRole("region", { name: "Driver coverage" })
        .getByRole("listitem").filter({ hasText: label });
    async function openOffer(person, label) {
      const item = card(person, label);
      await item.getByRole("button", { name: "I can drive", exact: true }).click();
      return item;
    }
    async function submitOffer(item, seats) {
      await item.getByLabel("Passenger seats you can offer").fill(String(seats));
      await item.getByRole("checkbox", { name: /required restraints/ }).check();
      await item.getByRole("button", { name: "Offer to drive", exact: true }).click();
    }
    async function approve(person, child) {
      const submit = person.page.getByRole("button", {
        name: "Approve driver for selected children",
      });
      const form = person.page.getByRole("form").filter({ has: submit });
      await form.getByRole("checkbox", { name: child, exact: true }).check();
      await form.getByRole("checkbox", { name: /I explicitly consent/ }).check();
      await submit.click();
    }

    await driver.page.goto("/app");
    const twoRiders = await openOffer(driver, "Two-rider pickup");
    await expect(twoRiders).toContainText("2 riders need seats.");
    await expect(twoRiders).toContainText("1 booster seat · 1 child seat");
    await expect(twoRiders.getByRole("option", { name: /One-seat car/ })).toHaveCount(0);
    const seats = twoRiders.getByLabel("Passenger seats you can offer");
    await expect(seats).toHaveValue("4");
    await twoRiders.getByRole("combobox", { name: "Car" }).selectOption(driverCar.p_vehicle_id);
    await expect(seats).toHaveValue("3");
    await twoRiders.getByRole("combobox", { name: "Car" }).selectOption(van);
    await expect(seats).toHaveValue("4");
    const request = driver.page.waitForRequest((req) =>
      req.method() === "POST" && new URL(req.url()).pathname.endsWith("/rpc/offer_to_drive"),
    );
    await submitOffer(twoRiders, 2);
    const submitted = (await request).postDataJSON();
    await expect(twoRiders).toContainText("Awaiting guardian approval");
    await expect(twoRiders.getByRole("button", { name: "I can drive" })).toHaveCount(0);
    const [pending] = await rpc(driver, "driver_status", { p_ride_id: ride });
    expect(pending).toMatchObject({
      driver_id: driverCar.p_driver_id,
      vehicle_id: van,
      available_seats: 2,
      restraints_confirmed: true,
      consent_count: 0,
    });
    expect(pending.accepted_at).toBeTruthy();
    expect(await rpc(driver, "offer_to_drive", submitted)).toBe(pending.proposal_id);

    await guardian.page.goto("/app");
    const guardianCard = card(guardian, "Two-rider pickup");
    await expect(guardianCard).toContainText("Awaiting guardian approval");
    await guardianCard.getByRole("link", { name: "Two-rider pickup → Practice" }).click();
    await expect(guardian.page.getByText("Volunteer family · Practice van", { exact: true }).first()).toBeVisible();
    await expect(guardian.page.getByText("2 offered passenger seats", { exact: true })).toBeVisible();
    await expect(guardian.page.getByRole("checkbox", { name: "Volunteer child", exact: true })).toHaveCount(0);
    const wrongConsent = await authenticatedRpc(guardian.page, "consent_for_own_children", {
      p_id: pending.proposal_id,
      p_revision: pending.ride_revision,
      p_family_id: guardianFamily,
      p_child_ids: [driverChild],
    });
    expect((await wrongConsent.json()).code).toBe("PT400");

    await driver.page.goto(`/app/rides/${ride}`);
    await approve(driver, "Volunteer child");
    await expect(driver.page.getByText("Child consents: 1 of 2", { exact: false })).toBeVisible();
    await expect(driver.page.getByText("Awaiting guardian approval", { exact: true })).toBeVisible();
    await approve(guardian, "Approver child");
    await expect(guardian.page.getByText("Confirmed", { exact: true })).toBeVisible();
    await driver.page.reload();
    await expect(driver.page.getByText("Confirmed", { exact: true })).toBeVisible();
    expect(await rpc(driver, "offer_to_drive", submitted)).toBe(pending.proposal_id);
    const changedReplay = await authenticatedRpc(driver.page, "offer_to_drive", {
      ...submitted,
      p_available_seats: 3,
    });
    expect((await changedReplay.json()).code).toBe("PT409");

    await driver.page.goto("/app");
    const threeRiders = await openOffer(driver, "Three-rider pickup");
    await expect(threeRiders).toContainText("3 riders need seats.");
    await submitOffer(threeRiders, 2);
    await expect(threeRiders.getByRole("alert")).toContainText("Offer a seat for every rider");
    expect(await rpc(driver, "driver_status", { p_ride_id: crowded })).toEqual([]);

    await guardian.page.goto("/app");
    const staleForm = await openOffer(driver, "Contested pickup");
    const firstForm = await openOffer(guardian, "Contested pickup");
    await submitOffer(firstForm, 2);
    await expect(firstForm).toContainText("Awaiting guardian approval");
    await submitOffer(staleForm, 2);
    await expect(staleForm.getByRole("alert")).toContainText("A driver proposal or assignment is already in place");
    const [winner] = await rpc(driver, "driver_status", { p_ride_id: contested });
    expect(winner.driver_id).toBe(guardianCar.p_driver_id);

    function offerArgs(family, car, overrides = {}) {
      return {
        p_id: crypto.randomUUID(),
        p_ride_id: simultaneous,
        p_family_id: family,
        p_revision: 2,
        p_vehicle_id: car.p_vehicle_id,
        p_vehicle_version: car.p_vehicle_version,
        p_available_seats: 2,
        p_restraints: true,
        ...overrides,
      };
    }
    for (const [args, code] of [
      [offerArgs(guardianFamily, driverCar), "PT404"],
      [offerArgs(driverFamily, guardianCar), "PT404"],
      [offerArgs(driverFamily, driverCar, { p_available_seats: 4 }), "PT422"],
      [offerArgs(driverFamily, driverCar, { p_restraints: false }), "PT422"],
    ]) {
      const response = await authenticatedRpc(driver.page, "offer_to_drive", args);
      expect((await response.json()).code).toBe(code);
    }
    const driverArgs = offerArgs(driverFamily, driverCar);
    const guardianArgs = offerArgs(guardianFamily, guardianCar);
    const replies = await Promise.all([
      authenticatedRpc(driver.page, "offer_to_drive", driverArgs),
      authenticatedRpc(guardian.page, "offer_to_drive", guardianArgs),
    ]);
    expect(replies.map((reply) => reply.status()).sort()).toEqual([200, 409]);
    const winningArgs = replies[0].ok() ? driverArgs : guardianArgs;
    const [saved] = await rpc(driver, "driver_status", { p_ride_id: simultaneous });
    expect(saved).toMatchObject({
      proposal_id: winningArgs.p_id,
      ride_revision: 3,
      available_seats: 2,
      consent_count: 0,
    });
  } finally {
    await Promise.all([driver.context.close(), guardian.context.close()]);
  }
});
