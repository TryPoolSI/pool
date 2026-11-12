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

async function createChild(person, family, name) {
  return rpc(person, "save_own_child", {
    p_id: crypto.randomUUID(),
    p_family_id: family,
    p_display_name: name,
    p_seat_requirement: "standard",
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
        page.getByRole("heading", { name: "Welcome to Pool" }),
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

      await page.reload();
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
