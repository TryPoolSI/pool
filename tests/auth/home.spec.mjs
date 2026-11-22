import { Buffer } from "node:buffer";
import { test, expect } from "@playwright/test";
import { account, expectToast } from "./helpers.mjs";
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

// Ride times carry a UTC offset only when the ride's timezone differs from the
// device's, so each journey says where its devices are.
const devicesIn = (browser, timezoneId) => ({
  newContext: (options) => browser.newContext({ ...options, timezoneId }),
});
const needsDriver = (page) =>
  page.getByRole("region", { name: "Needs a driver", exact: true });
// Each ride is one link, named by its route, time, state and who acts next.
const rideLinks = (page) =>
  needsDriver(page).getByRole("listitem").getByRole("link");
// The listed rides, in order, each matching its expected name.
async function expectRides(page, names) {
  await expect(rideLinks(page)).toHaveCount(names.length);
  for (const [index, name] of names.entries())
    await expect(rideLinks(page).nth(index)).toHaveAccessibleName(name);
}
const waitingBanner = (page) =>
  page.getByRole("heading", { name: /rides? needs? your reply$/ });
const offerButton = (scope) =>
  scope.getByRole("button", { name: "I’ll drive", exact: true });
// Pool tells the families on a ride what changed instead of asking each one.
const whatChanged = (page) =>
  page.getByRole("region", { name: "What changed", exact: true });
// Keeps a screen on what it has already loaded: every data read stays
// unanswered, so the 20-second refresh cannot update it. Only the named
// command still reaches the server.
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

test("Home shows joined rides without confirmed coverage across circles", async ({
  browser,
}) => {
  // Rides are in Denver and this adult's device is not, so times say so.
  const member = await account(
    devicesIn(browser, "America/New_York"),
    "home-member",
  );
  try {
    const other = await account(
      devicesIn(browser, "America/New_York"),
      "home-other",
    );
    try {
      const { page } = member;
      await page.setViewportSize({ width: 320, height: 844 });
      const coverage = needsDriver(page);
      await expect(
        page.getByRole("heading", { level: 1, name: "Welcome to Pool" }),
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
      await expect(
        page.getByRole("heading", { level: 1, name: "Home", exact: true }),
      ).toBeVisible();
      await expect(page.getByText("Home family", { exact: true })).toBeVisible();
      await expect(
        coverage.getByRole("heading", { name: "No rides this week", exact: true }),
      ).toBeVisible();
      await expect(
        coverage.getByRole("link", { name: "Plan a ride", exact: true }),
      ).toHaveAttribute("href", "/app/rides/new");
      await expect(waitingBanner(page)).toHaveCount(0);

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

      // The list of joined rides and the count of rides waiting on this adult
      // are separate reads of the same endpoint.
      const offers = (status) => (url) =>
        url.pathname.endsWith("/rest/v1/rpc/ride_offers") &&
        url.searchParams.get("status") === `eq.${status}`;
      await page.route(offers("joined"), (route) => route.abort(), { times: 1 });
      await page.reload();
      await expect(page.getByRole("main").getByRole("alert")).toHaveText(
        "Pool couldn’t load your rides. Check your connection and try again.",
      );
      await expect(
        page.getByRole("link", { name: "Have an invitation link?" }),
      ).toHaveAttribute("href", "/app/invitations");
      await expect(page.getByRole("link", { name: "North circle" })).toBeVisible();
      await expect(coverage).toHaveCount(0);
      await expect(page.getByText("No rides this week")).toHaveCount(0);

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
      await page
        .getByRole("main")
        .getByRole("button", { name: "Try again", exact: true })
        .click();

      // One flat list across circles, soonest first. The offset is shown
      // because these Denver rides are read on a New York device.
      await expectRides(page, [
        /^Early pickup → Practice, .+ GMT-7, Needs driver\. No one is driving yet$/,
        /^Later pickup → Practice, .+ GMT-7, Needs driver\. No one is driving yet$/,
        /^Pending pickup → Practice, .+ GMT-7, Your reply\. You were asked to drive$/,
      ]);
      await expect(rideLinks(page).first()).toHaveAttribute(
        "href",
        `/app/rides/${early}`,
      );
      await expect(coverage.getByText("Needs driver", { exact: true })).toHaveCount(2);
      await expect(coverage.getByText("Your reply", { exact: true })).toHaveCount(1);
      await expect(coverage.getByRole("listitem")).toHaveCount(3);
      await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
      // Cancelled, past, later, not-yet-joined and other circles' rides stay out,
      // and no card carries an address.
      await expect(
        page.getByText(
          /Cancelled pickup|Past pickup|Next week pickup|Invited pickup|Unjoined pickup|Private pickup/,
        ),
      ).toHaveCount(0);
      await expect(offerButton(coverage)).toHaveCount(0);
      await page.unroute(offerDetailsUrl);
      await expect(page.getByRole("link", { name: "Private circle" })).toHaveCount(
        0,
      );
      await expect(
        coverage.getByRole("link", { name: "Schedule", exact: true }),
      ).toHaveAttribute("href", "/app/schedule");
      // The request to drive and the invitation are both waiting on this adult.
      await expect(waitingBanner(page)).toHaveText("2 rides need your reply");
      await expect(
        page.getByRole("link", { name: "See what’s waiting" }),
      ).toHaveAttribute("href", "/app/attention");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);

      // If the waiting count cannot be read, the rides still show.
      await page.route(offers("invited"), (route) => route.abort(), { times: 1 });
      await page.reload();
      await expect(rideLinks(page)).toHaveCount(3);
      await expect(waitingBanner(page)).toHaveCount(0);
      await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);

      // The driver's yes sets the ride: no family has to approve.
      expect(
        await rpc(member, "accept_driver_proposal", {
          p_id: proposal,
          p_revision: 2,
          p_available_seats: 3,
          p_restraints: true,
        }),
      ).toBe("confirmed");
      // Home refreshes by itself; a reload is the immediate way.
      await page.reload();
      await expectRides(page, [
        /^Early pickup → Practice, /,
        /^Later pickup → Practice, /,
      ]);
      await expect(page.getByText("Pending pickup")).toHaveCount(0);
      await expect(offerButton(coverage)).toHaveCount(2);
      await expect(waitingBanner(page)).toHaveText("1 ride needs your reply");

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
      // A ride with a driver stays covered while a swap is only being asked.
      await page.reload();
      await expect(rideLinks(page)).toHaveCount(2);
      await expect(page.getByText("Pending pickup")).toHaveCount(0);

      // Once every joined ride has a driver, Home says so instead of listing.
      // An offer covers the ride at once, whoever else is riding.
      async function cover(rideId, revision) {
        await rpc(member, "offer_to_drive", {
          p_id: crypto.randomUUID(),
          p_ride_id: rideId,
          p_family_id: family,
          p_revision: revision,
          p_vehicle_id: memberDriver.p_vehicle_id,
          p_vehicle_version: memberDriver.p_vehicle_version,
          p_available_seats: 3,
          p_restraints: true,
        });
        const [status] = await rpc(member, "driver_status", {
          p_ride_id: rideId,
        });
        expect(status.coverage).toBe("confirmed");
      }
      await cover(early, 1);
      await page.reload();
      await expectRides(page, [
        /^Later pickup → Practice, /,
      ]);
      await cover(later, 2);
      await page.reload();
      await expect(
        coverage.getByRole("heading", {
          name: "All 3 rides this week have a driver",
          exact: true,
        }),
      ).toBeVisible();
      await expect(coverage.getByRole("listitem")).toHaveCount(0);
      // What other people did is told, not asked: the other family joined a
      // ride this adult drives. This adult's own driving is not news to them.
      const news = whatChanged(page);
      await expect(
        news.getByRole("heading", { name: "What changed", exact: true }),
      ).toBeVisible();
      await expect(news.getByText("Last 3 days", { exact: true })).toBeVisible();
      await expect(news.getByRole("link")).toHaveCount(1);
      await expect(news.getByRole("link")).toHaveAccessibleName(
        /^Other family joined\. .+ · Later pickup → Practice$/,
      );
      await expect(news.getByRole("link")).toHaveAttribute(
        "href",
        `/app/rides/${later}`,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      // The other family is told who drives the ride it joined, and that
      // someone asked it to take over another is its own move, not news.
      await other.page.goto("/app");
      await expect(
        whatChanged(other.page).getByRole("link", {
          name: /^Home is driving\. .+ · Later pickup → Practice$/,
        }),
      ).toHaveAttribute("href", `/app/rides/${later}`);
      await expect(whatChanged(other.page).getByRole("link")).toHaveCount(1);
    } finally {
      await other.context.close();
    }
  } finally {
    await member.context.close();
  }
});

test("Home offers driving in one tap, and the offer sets the ride for every family", async ({
  browser,
}) => {
  // Everyone here is on Denver time, like the rides, so no offset is shown.
  const driver = await account(devicesIn(browser, "America/Denver"), "volunteer");
  const guardian = await account(devicesIn(browser, "America/Denver"), "rider-family");
  try {
    const driverFamily = await createFamily(driver, "Volunteer family");
    const guardianFamily = await createFamily(guardian, "Rider family");
    const circle = await createCircle(driver, driverFamily, "Practice circle");
    await joinCircle(driver, circle, guardian, guardianFamily);
    const driverChild = await createChild(driver, driverFamily, "Volunteer child", "booster");
    const extraChild = await createChild(driver, driverFamily, "Extra rider");
    const fourthChild = await createChild(driver, driverFamily, "Fourth rider");
    const guardianChild = await createChild(guardian, guardianFamily, "Rider child", "child-seat");
    const driverCar = await registerDriver(driver, driverFamily);
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
    const crowded = await joinedRide("Four-rider pickup", 8, [
      driverChild,
      extraChild,
      fourthChild,
    ]);
    const contested = await joinedRide("Contested pickup", 12);
    const simultaneous = await joinedRide("Simultaneous pickup", 16);

    const card = (person, label) =>
      needsDriver(person.page).getByRole("listitem").filter({ hasText: label });
    const sheet = (person) =>
      person.page.getByRole("dialog", { name: "I’ll drive", exact: true });
    const seatsTick = (person) =>
      sheet(person).getByRole("checkbox", {
        name: "I have 1 booster and 1 child seat",
        exact: true,
      });
    // The sheet asks only what Pool cannot know: which car, and the seats
    // these riders need. Nobody counts passenger seats.
    const closeSheet = (person) =>
      sheet(person).getByRole("button", {
        name: "Close I’ll drive",
        exact: true,
      });
    async function openOffer(person, label) {
      await offerButton(card(person, label)).click();
      // Focus moves into the sheet once it has finished opening.
      await expect(closeSheet(person)).toBeFocused();
      await expect(sheet(person)).toContainText(`${label} → Practice`);
      await expect(sheet(person).getByRole("spinbutton")).toHaveCount(0);
      return sheet(person);
    }
    async function submitOffer(person) {
      await seatsTick(person).check();
      await offerButton(sheet(person)).click();
    }
    const offerRequest = (person) =>
      person.page.waitForRequest(
        (req) =>
          req.method() === "POST" &&
          new URL(req.url()).pathname.endsWith("/rpc/offer_to_drive"),
      );

    // An adult with no car is offered the way to add one, on every ride that
    // still needs a driver, and can then offer for the rides the car can take.
    await guardian.page.goto("/app");
    const addCar = needsDriver(guardian.page).getByRole("button", {
      name: "Add a car to drive",
      exact: true,
    });
    await expect(addCar).toHaveCount(4);
    await expect(offerButton(needsDriver(guardian.page))).toHaveCount(0);
    await addCar.first().click();
    const carSheet = guardian.page.getByRole("dialog", {
      name: "Add your car",
      exact: true,
    });
    await carSheet.getByLabel("Car name", { exact: true }).fill("Home test car");
    await carSheet
      .getByRole("radiogroup", { name: "Seats for passengers", exact: true })
      .getByRole("radio", { name: "3", exact: true })
      .click();
    await carSheet.getByRole("button", { name: "Add car", exact: true }).click();
    await expectToast(guardian.page, "Home test car added");
    await expect(carSheet).toHaveCount(0);
    await expect(guardian.page).toHaveURL(/\/app$/);
    await expect(addCar).toHaveCount(0);
    await expect(offerButton(needsDriver(guardian.page))).toHaveCount(3);
    // A ride with more riders than the car seats says so instead.
    const guardianCrowded = card(guardian, "Four-rider pickup");
    await expect(
      guardianCrowded.getByText(
        "This ride has 4 riders, more than your car seats.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(offerButton(guardianCrowded)).toHaveCount(0);
    const guardianToken = await sessionToken(guardian.context);
    const [savedCar] = await (
      await guardian.page.request.get(
        "http://localhost:55321/rest/v1/vehicles?select=id,version,passenger_seats",
        {
          headers: {
            apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
            authorization: `Bearer ${guardianToken}`,
          },
        },
      )
    ).json();
    expect(savedCar.passenger_seats).toBe(3);
    const guardianCar = {
      p_driver_id: JSON.parse(
        Buffer.from(guardianToken.split(".")[1], "base64url"),
      ).sub,
      p_driver_family_id: guardianFamily,
      p_vehicle_id: savedCar.id,
      p_vehicle_version: savedCar.version,
    };

    await driver.page.goto("/app");
    const twoRiders = card(driver, "Two-rider pickup");
    const twoRidersLink = twoRiders.getByRole("link");
    await expect(twoRidersLink).toHaveAccessibleName(
      /^Two-rider pickup → Practice, .+, Needs driver\. No one is driving yet$/,
    );
    await expect(twoRidersLink).not.toHaveAccessibleName(/GMT|UTC/);
    const offerTrigger = offerButton(twoRiders);
    await openOffer(driver, "Two-rider pickup");
    await driver.page.keyboard.press("Escape");
    await expect(sheet(driver)).toHaveCount(0);
    await expect(offerTrigger).toBeFocused();
    await twoRidersLink.focus();
    await driver.page.keyboard.press("Tab");
    await expect(offerTrigger).toBeFocused();
    await driver.page.keyboard.press("Enter");
    await expect(closeSheet(driver)).toBeFocused();
    await expect(sheet(driver)).toContainText(
      "2 riders · needs 1 booster and 1 child seat",
    );
    const carChoice = sheet(driver).getByRole("combobox", { name: "Car" });
    await expect(carChoice.getByRole("option")).toHaveText([
      "Practice van · 4 seats",
      "Home test car · 3 seats",
    ]);
    await expect(carChoice).toHaveValue(van);
    await carChoice.selectOption(driverCar.p_vehicle_id);
    await expect(carChoice).toHaveValue(driverCar.p_vehicle_id);
    await carChoice.selectOption(van);
    // The seats these riders need have to be confirmed before anything is sent.
    let sent = 0;
    const countOffers = (req) => {
      if (new URL(req.url()).pathname.endsWith("/rpc/offer_to_drive")) sent++;
    };
    driver.page.on("request", countOffers);
    await offerButton(sheet(driver)).click();
    await expect(sheet(driver).getByRole("alert")).toHaveText(
      "Tick “I have 1 booster and 1 child seat” to continue.",
    );
    expect(sent).toBe(0);
    driver.page.off("request", countOffers);
    // Tapping makes this adult the driver, and the sheet says so first.
    await expect(
      sheet(driver).getByText(
        "You’re the driver as soon as you tap. The families on this ride are told.",
        { exact: true },
      ),
    ).toBeVisible();
    const request = offerRequest(driver);
    await submitOffer(driver);
    const submitted = (await request).postDataJSON();
    // The sheet closes, a toast confirms, and Home stays where it was. The
    // ride has its driver, so it leaves "Needs a driver".
    await expectToast(driver.page, "You’re driving");
    await expect(sheet(driver)).toHaveCount(0);
    await expect(driver.page).toHaveURL(/\/app$/);
    await expect(twoRiders).toHaveCount(0);
    await expect(rideLinks(driver.page)).toHaveCount(3);
    const [covered] = await rpc(driver, "driver_status", { p_ride_id: ride });
    // The whole car is offered, and nobody else has to say yes.
    expect(covered).toMatchObject({
      coverage: "confirmed",
      driver_id: driverCar.p_driver_id,
      vehicle_id: van,
      available_seats: 4,
      restraints_confirmed: true,
      rider_count: 2,
      is_current_driver: true,
    });
    expect(submitted).toMatchObject({
      p_vehicle_id: van,
      p_available_seats: 4,
      p_restraints: true,
    });
    expect(covered.accepted_at).toBeTruthy();
    expect(await rpc(driver, "offer_to_drive", submitted)).toBe(covered.proposal_id);

    // The other family is told, not asked: nothing waits on it.
    await guardian.page.goto("/app");
    await expect(card(guardian, "Two-rider pickup")).toHaveCount(0);
    await expect(rideLinks(guardian.page)).toHaveCount(3);
    await expect(waitingBanner(guardian.page)).toHaveCount(0);
    const told = whatChanged(guardian.page).getByRole("link", {
      name: /^Volunteer is driving\. .+ · Two-rider pickup → Practice$/,
    });
    await expect(whatChanged(guardian.page).getByRole("link")).toHaveCount(1);
    await told.click();
    await expect(guardian.page).toHaveURL(new RegExp(`/app/rides/${ride}$`));
    const rideBadge = (person, label) =>
      person.page
        .getByRole("heading", { level: 1 })
        .locator("xpath=../..")
        .getByText(label, { exact: true });
    await expect(rideBadge(guardian, "Covered")).toBeVisible();
    await expect(
      guardian.page.getByText("Volunteer family is driving", { exact: true }),
    ).toBeVisible();
    await expect(
      guardian.page.getByText("Practice van", { exact: true }),
    ).toBeVisible();
    // There is no approval step, for anyone.
    await expect(
      guardian.page.getByRole("region", { name: "Your next step" }),
    ).toHaveCount(0);
    await expect(
      guardian.page.getByRole("button", { name: /Approve/ }),
    ).toHaveCount(0);
    // A family can still ask for a different driver, from the Driver card.
    await expect(
      guardian.page.getByRole("button", {
        name: "Ask someone else to drive",
        exact: true,
      }),
    ).toBeVisible();

    await driver.page.goto(`/app/rides/${ride}`);
    await expect(rideBadge(driver, "You’re driving")).toBeVisible();
    // The Driver card says so too.
    await expect(
      driver.page.getByText("You’re driving", { exact: true }),
    ).toHaveCount(2);
    await expect(
      driver.page.getByText("2 riders · bring 1 booster and 1 child seat", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      driver.page.getByRole("region", { name: "Your next step" }),
    ).toHaveCount(0);
    await expect(
      driver.page.getByRole("button", {
        name: "Ask someone to take over",
        exact: true,
      }),
    ).toBeVisible();
    // The driver's own offer is not news to the driver.
    await driver.page.goto("/app");
    await expect(
      driver.page.getByRole("heading", { level: 1, name: "Home", exact: true }),
    ).toBeVisible();
    await expect(rideLinks(driver.page)).toHaveCount(3);
    // Who joined is told to whoever drives that ride, and only for that ride.
    await expect(whatChanged(driver.page).getByRole("link")).toHaveAccessibleName(
      /^Rider family joined\. .+ · Two-rider pickup → Practice$/,
    );
    await expect(
      whatChanged(driver.page).getByRole("link", { name: /driving/ }),
    ).toHaveCount(0);
    expect(await rpc(driver, "offer_to_drive", submitted)).toBe(covered.proposal_id);
    const changedReplay = await authenticatedRpc(driver.page, "offer_to_drive", {
      ...submitted,
      p_available_seats: 3,
    });
    expect((await changedReplay.json()).code).toBe("PT409");

    // Only cars with a seat for every rider are offered. With one such car
    // there is nothing to choose.
    await openOffer(driver, "Four-rider pickup");
    await expect(sheet(driver)).toContainText(
      "4 riders · needs 1 booster and 1 child seat",
    );
    await expect(sheet(driver).getByRole("combobox")).toHaveCount(0);
    await expect(
      sheet(driver).getByText("You’ll drive the Practice van.", { exact: true }),
    ).toBeVisible();
    await driver.page.keyboard.press("Escape");
    await expect(sheet(driver)).toHaveCount(0);
    // The server refuses a car that is too small, whatever the page sends.
    const tooSmall = await authenticatedRpc(driver.page, "offer_to_drive", {
      p_id: crypto.randomUUID(),
      p_ride_id: crowded,
      p_family_id: driverFamily,
      p_revision: 2,
      p_vehicle_id: driverCar.p_vehicle_id,
      p_vehicle_version: driverCar.p_vehicle_version,
      p_available_seats: 3,
      p_restraints: true,
    });
    expect((await tooSmall.json()).code).toBe("PT422");
    expect(await rpc(driver, "driver_status", { p_ride_id: crowded })).toEqual([]);
    await guardian.page.goto("/app");
    await expect(
      guardianCrowded.getByText(
        "This ride has 4 riders, more than your car seats.",
        { exact: true },
      ),
    ).toBeVisible();

    // Two adults offer for the same ride; the second is told who got there.
    await openOffer(driver, "Contested pickup");
    await holdReads(driver.page, "offer_to_drive");
    await openOffer(guardian, "Contested pickup");
    await expect(sheet(guardian).getByRole("combobox")).toHaveCount(0);
    await submitOffer(guardian);
    await expectToast(guardian.page, "You’re driving");
    await expect(card(guardian, "Contested pickup")).toHaveCount(0);
    await submitOffer(driver);
    await expect(sheet(driver).getByRole("alert")).toHaveText(
      "Someone is already lined up to drive this ride. Open it to see who.",
    );
    await driver.page.unrouteAll({ behavior: "ignoreErrors" });
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
      coverage: "confirmed",
    });

    // A family that has not answered does not hold up a driver: the ride is
    // on Home with its offer, and the invited family sees who drives.
    const starts = now + 20 * 3600_000;
    const unanswered = await rpc(driver, "create_ride", {
      p_id: crypto.randomUUID(),
      p_family_id: driverFamily,
      p_circle_id: circle,
      p_pickup_summary: "Unanswered pickup",
      p_destination_summary: "Practice",
      p_pickup: "Private pickup address",
      p_destination: "Private practice address",
      p_direction: "outbound",
      p_starts_at: new Date(starts).toISOString(),
      p_ends_at: new Date(starts + 3600_000).toISOString(),
      p_timezone: "America/Denver",
      p_child_ids: [driverChild],
      p_invited_family_ids: [guardianFamily],
    });
    const revision = async (person) =>
      (await rpc(person, "ride_offer", { p_id: unanswered }))[0].revision;
    await guardian.page.goto("/app");
    await expect(waitingBanner(guardian.page)).toHaveText(
      "1 ride needs your reply",
    );
    await expect(card(guardian, "Unanswered pickup")).toHaveCount(0);
    await driver.page.goto("/app");
    await expect(
      card(driver, "Unanswered pickup").getByRole("link"),
    ).toHaveAccessibleName(
      /^Unanswered pickup → Practice, .+, Needs driver\. No one is driving yet$/,
    );
    await openOffer(driver, "Unanswered pickup");
    await expect(sheet(driver)).toContainText("1 rider · needs 1 booster");
    await sheet(driver)
      .getByRole("checkbox", { name: "I have 1 booster", exact: true })
      .check();
    await offerButton(sheet(driver)).click();
    await expectToast(driver.page, "You’re driving");
    await expect(card(driver, "Unanswered pickup")).toHaveCount(0);
    const before = await revision(driver);
    // Today names the driver on the invitation.
    await guardian.page.goto("/app/attention");
    await guardian.page
      .getByRole("link", {
        name: /^Unanswered pickup → Practice, .+, Invited\. Volunteer is driving · join or decline$/,
      })
      .click();
    await expect(guardian.page).toHaveURL(new RegExp(`/app/rides/${unanswered}$`));
    await expect(rideBadge(guardian, "Invited")).toBeVisible();
    const step = guardian.page.getByRole("region", {
      name: "Your next step",
      exact: true,
    });
    await expect(
      step.getByText("Volunteer is driving the Practice van.", { exact: true }),
    ).toBeVisible();
    await expect(
      guardian.page.getByText("Volunteer family is driving", { exact: true }),
    ).toBeVisible();
    // Joining late keeps the driver: the car has room, so nothing is asked again.
    await expect(
      step.getByRole("checkbox", { name: "Rider child", exact: true }),
    ).toBeChecked();
    await step.getByRole("button", { name: "Join ride", exact: true }).click();
    await expectToast(guardian.page, "You’re in");
    await expect(rideBadge(guardian, "Covered")).toBeVisible();
    await expect(
      guardian.page.getByText("Private pickup address", { exact: true }),
    ).toBeVisible();
    const [joined] = await rpc(driver, "driver_status", { p_ride_id: unanswered });
    expect(joined).toMatchObject({
      coverage: "confirmed",
      rider_count: 2,
      booster_count: 1,
      child_seat_count: 1,
      is_current_driver: true,
    });
    expect(await revision(driver)).toBe(before);
    // The driver is told who joined.
    await driver.page.goto("/app");
    await expect(
      whatChanged(driver.page).getByRole("link", {
        name: /^Rider family joined\. .+ · Unanswered pickup → Practice$/,
      }),
    ).toHaveAttribute("href", `/app/rides/${unanswered}`);
  } finally {
    await Promise.all([driver.context.close(), guardian.context.close()]);
  }
});
