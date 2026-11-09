import { captureRpc, replayRpc } from "./rpc.mjs";
import {
  visit,
  refresh,
  openAction,
  account,
  family,
  invitation,
  openAndCheck,
} from "./helpers.mjs";
import { test, expect } from "@playwright/test";
async function join(inviter, person, circleUrl, familyName) {
  await visit(inviter.page, circleUrl);
  const link = await invitation(inviter.page, person.email, "circle");
  await openAndCheck(person.page, link);
  await person.page.getByLabel("Your display name").fill(familyName);
  await person.page
    .getByLabel("Family to join the circle")
    .selectOption({ label: familyName });
  await person.page
    .getByLabel("I explicitly accept this circle family membership.")
    .check();
  await person.page
    .getByRole("button", { name: "Accept invitation", exact: true })
    .click();
  await expect(person.page.getByRole("status")).toContainText(
    "Membership accepted",
  );
}
async function child(page, name) {
  await visit(page, "/app/children");
  if (
    await page.getByRole("button", { name: "Add a child", exact: true }).count()
  )
    await openAction(page, "Add a child");
  const f = page.locator('[role="form"]').filter({
    has: page.getByRole("button", { name: "Save child", exact: true }),
  });
  await f.getByLabel("Child display name").fill(name);
  await f.getByLabel("Seat requirement").selectOption("booster");
  await f.getByRole("button", { name: "Save child", exact: true }).click();
  await expect(f.getByRole("status")).toContainText("Saved");
}
const journey = (page, name) =>
  page.getByRole("article", { name: `Journey for ${name}`, exact: true });
async function report(page, name, button) {
  const article = journey(page, name),
    f = article
      .locator('[role="form"]')
      .filter({ has: page.getByRole("button", { name: button, exact: true }) });
  await f.getByRole("checkbox").check();
  await f.getByRole("button", { name: button, exact: true }).focus();
  await page.keyboard.press("Enter");
}
test("R6: independent driver and guardians persist arrival and confirm each child separately with explicit receipt", async ({
  browser,
}) => {
  const a = await account(browser, "r6-a"),
    b = await account(browser, "r6-b"),
    d = await account(browser, "r6-driver"),
    out = await account(browser, "r6-outside");
  try {
    await family(a.page, "Handoff family A", "Receiving guardian A");
    await family(b.page, "Handoff family B", "Receiving guardian B");
    await family(d.page, "Handoff driver family", "Reporting driver");
    await family(out.page, "Handoff outside family", "Outside guardian");
    await openAction(a.page, "Create a circle");
    await a.page.getByLabel("Circle name").fill("Handoff circle");
    await a.page
      .getByRole("button", { name: "Create circle", exact: true })
      .click();
    await a.page.getByRole("link", { name: "Open saved membership" }).click();
    await expect(
      a.page.getByRole("heading", { name: "Handoff circle", exact: true }),
    ).toBeVisible();
    const circleUrl = a.page.url();
    await join(a, b, circleUrl, "Handoff family B");
    await join(a, d, circleUrl, "Handoff driver family");
    await child(a.page, "Handoff child A");
    await child(b.page, "Handoff child B");
    await visit(d.page, "/app/vehicles");
    await d.page.getByLabel("Vehicle label").fill("Handoff van");
    await d.page.getByLabel("Passenger seats, excluding you").fill("3");
    await d.page
      .getByRole("button", { name: "Save vehicle", exact: true })
      .click();
    await expect(d.page.getByRole("status")).toContainText("Saved");
    await visit(a.page, "/app/rides/new");
    for (const [label, value] of [
      ["Pickup summary", "Handoff neighborhood"],
      ["Drop-off summary", "Handoff activity"],
      ["Exact pickup", "111 Handoff pickup"],
      ["Exact drop-off", "222 Handoff destination"],
      ["IANA timezone", "UTC"],
      ["Pickup time", "2027-09-02T14:00"],
      ["Drop-off time", "2027-09-02T15:00"],
    ])
      await a.page.getByLabel(label, { exact: true }).fill(value);
    await a.page.getByLabel("Handoff child A", { exact: true }).check();
    await a.page.getByLabel("Handoff family B", { exact: true }).check();
    await a.page
      .getByRole("button", { name: "Create ride", exact: true })
      .click();
    await a.page.getByRole("link", { name: "Open saved result" }).click();
    await expect(
      a.page.getByRole("heading", {
        name: "Handoff neighborhood → Handoff activity",
        exact: true,
      }),
    ).toBeVisible();
    const url = a.page.url();
    await visit(b.page, url);
    await b.page.getByLabel("Handoff child B", { exact: true }).check();
    await b.page
      .getByRole("button", { name: "Join with own riders", exact: true })
      .click();
    await expect(
      b.page.getByText("111 Handoff pickup", { exact: true }),
    ).toBeVisible();
    await refresh(a.page);
    await a.page.getByLabel("Driver and registered vehicle").selectOption({
      label: "Reporting driver · Handoff van · 3 passenger seats",
    });
    await a.page
      .getByLabel(
        "I nominate this adult and vehicle for this ride’s current riders and plan.",
      )
      .check();
    await a.page
      .getByRole("button", { name: "Nominate driver", exact: true })
      .click();
    await expect(
      a.page.getByText("Awaiting confirmation", { exact: true }),
    ).toBeVisible();
    await visit(d.page, url);
    await d.page
      .getByLabel("Available passenger seats, excluding you")
      .fill("3");
    await d.page
      .getByLabel(
        "I can accommodate all 2 booster seats and 0 child seats required for these riders.",
      )
      .check();
    await d.page
      .getByLabel(
        "I explicitly accept driving this ride with this vehicle and available passenger capacity.",
      )
      .check();
    await d.page
      .getByRole("button", { name: "Accept as driver", exact: true })
      .click();
    await expect(
      d.page.getByText("Driver acceptance: Accepted", { exact: false }),
    ).toBeVisible();
    for (const [p, name] of [
      [a, "Handoff child A"],
      [b, "Handoff child B"],
    ]) {
      await refresh(p.page);
      const f = p.page.locator('[role="form"]').filter({
        has: p.page.getByRole("button", {
          name: "Approve driver for selected children",
          exact: true,
        }),
      });
      await f.getByLabel(name, { exact: true }).check();
      await f
        .getByLabel(
          "I explicitly consent to this driver, vehicle and plan for my selected children.",
        )
        .check();
      await f
        .getByRole("button", {
          name: "Approve driver for selected children",
          exact: true,
        })
        .click();
      await expect(
        p.page.getByText(`${name}: Consent saved`, { exact: true }),
      ).toBeVisible();
      const j = journey(p.page, name);
      await j
        .getByLabel(`Designated guardian for ${name}`)
        .selectOption({ index: 1 });
      await j.getByRole("checkbox").check();
      await j
        .getByRole("button", { name: "Save designated guardian", exact: true })
        .click();
      await expect(j.getByRole("status")).toContainText(
        "Designated guardian saved",
      );
    }
    await refresh(d.page);
    await expect(d.page.getByText("Confirmed", { exact: true })).toBeVisible();
    await d.page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        d.page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      )
      .toBe(true);
    await report(d.page, "Handoff child A", "Report pickup");
    await expect(
      journey(d.page, "Handoff child A").getByText("Picked up", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      journey(d.page, "Handoff child A").getByRole("heading"),
    ).toBeFocused();
    await expect(
      d.page.getByRole("button", { name: "Withdraw as driver", exact: true }),
    ).toHaveCount(0);
    await expect(
      journey(d.page, "Handoff child B").getByText("Scheduled", {
        exact: true,
      }),
    ).toBeVisible();
    await report(d.page, "Handoff child B", "Report pickup");
    await expect(
      journey(d.page, "Handoff child B").getByText("Picked up", {
        exact: true,
      }),
    ).toBeVisible();
    await refresh(a.page);
    await expect(
      a.page.getByRole("button", {
        name: "Confirm child received",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      a.page.getByRole("button", { name: "Cancel ride", exact: true }),
    ).toHaveCount(0);
    for (const name of ["Handoff child A", "Handoff child B"]) {
      await report(d.page, name, "Report arrival");
      await expect(
        journey(d.page, name).getByText("Awaiting guardian receipt", {
          exact: true,
        }),
      ).toBeVisible();
    }
    await visit(d.page, "/app/driving");
    await visit(d.page, url);
    await expect(
      d.page.getByText("Awaiting guardian receipt", { exact: true }),
    ).toHaveCount(2);
    await expect(
      d.page.getByRole("button", {
        name: "Confirm child received",
        exact: true,
      }),
    ).toHaveCount(0);
    await visit(a.page, "/app/attention");
    await expect(
      a.page
        .getByTestId("task-list")
        .getByText("2 awaiting guardian receipt", { exact: false }),
    ).toBeVisible();
    await visit(a.page, url);
    await refresh(b.page);
    // Opening a form, checking it, navigating away and reloading never confirms receipt.
    await journey(a.page, "Handoff child A")
      .getByLabel("I explicitly confirm that I have received Handoff child A.")
      .check();
    await visit(a.page, "/app/attention");
    await visit(a.page, url);
    await expect(
      journey(a.page, "Handoff child A").getByText(
        "Awaiting guardian receipt",
        { exact: true },
      ),
    ).toBeVisible();
    // Replay the real receipt RPC with other adults' bearer sessions.
    const post = await captureRpc(a.page, () =>
      report(a.page, "Handoff child A", "Confirm child received"),
    );
    for (const person of [d, b, out])
      await replayRpc(post, person.context, "unavailable");
    await visit(a.page, url);
    await a.page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        a.page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      )
      .toBe(true);
    await report(a.page, "Handoff child A", "Confirm child received");
    await expect(
      journey(a.page, "Handoff child A").getByText("Handoff completed", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      journey(a.page, "Handoff child B").getByText(
        "Awaiting guardian receipt",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      a.page.getByText(
        "1 child awaits guardian receipt. The ride is not complete.",
        { exact: true },
      ),
    ).toBeVisible();
    await refresh(b.page);
    await expect(
      journey(b.page, "Handoff child A").getByRole("button", {
        name: "Confirm child received",
        exact: true,
      }),
    ).toHaveCount(0);
    await report(b.page, "Handoff child B", "Confirm child received");
    await expect(
      b.page.getByText("Ride completed — every child’s handoff is confirmed.", {
        exact: true,
      }),
    ).toBeVisible();
    for (const person of [a, b, d]) {
      await refresh(person.page);
      await expect(
        person.page.getByText("Handoff completed", { exact: true }),
      ).toHaveCount(2);
      await expect(
        person.page.getByRole("button", {
          name: /Report pickup|Report arrival|Confirm child received/,
        }),
      ).toHaveCount(0);
      await expect(
        person.page.getByRole("heading", {
          name: "Ride activity",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        person.page.getByText("reported by Reporting driver at", {
          exact: false,
        }),
      ).toHaveCount(4);
      await expect(
        person.page.getByText("reported by Receiving guardian A at", {
          exact: false,
        }),
      ).toHaveCount(1);
      await expect(
        person.page.getByText("reported by Receiving guardian B at", {
          exact: false,
        }),
      ).toHaveCount(1);
    }
    await visit(out.page, url);
    await expect(
      out.page.getByRole("heading", { name: "Ride unavailable", exact: true }),
    ).toBeVisible();
    await expect(
      out.page.getByRole("heading", { name: "Ride activity", exact: true }),
    ).toHaveCount(0);
    await visit(a.page, "/app/attention");
    await expect(
      a.page.getByRole("link", {
        name: "Handoff neighborhood → Handoff activity",
        exact: true,
      }),
    ).toHaveCount(0);
  } finally {
    await Promise.all([a, b, d, out].map((p) => p.context.close()));
  }
});
