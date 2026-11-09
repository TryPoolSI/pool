import { replayDenied } from "./rpc.mjs";
import {
  expandDetails,
  visit,
  refresh,
  openAction,
  closeAction,
  account,
  family,
  invitation,
  openAndCheck,
  password,
} from "./helpers.mjs";
import { captureState } from "./presentation.mjs";
import { test, expect } from "@playwright/test";
async function join(a, b, circle, name) {
  await visit(a.page, circle);
  const link = await invitation(a.page, b.email, "circle");
  await openAndCheck(b.page, link);
  await b.page.getByLabel("Your display name").fill(name);
  await b.page
    .getByLabel("Family to join the circle")
    .selectOption({ label: name });
  await b.page
    .getByLabel("I explicitly accept this circle family membership.")
    .check();
  await b.page
    .getByRole("button", { name: "Accept invitation", exact: true })
    .click();
  await expect(b.page.getByRole("status")).toContainText("Membership accepted");
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
async function vehicle(page, label) {
  await visit(page, "/app/vehicles");
  const f = page.locator('[role="form"]').filter({
    has: page.getByRole("button", { name: "Save vehicle", exact: true }),
  });
  await f.getByLabel("Vehicle label").fill(label);
  await f.getByLabel("Passenger seats, excluding you").fill("3");
  await f.getByRole("button", { name: "Save vehicle", exact: true }).click();
  await expect(f.getByRole("status")).toContainText("Saved");
}
async function approve(page, name) {
  await expandDetails(page);
  const f = page.locator('[role="form"]').filter({
    has: page.getByRole("button", {
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
    page.getByRole("listitem").filter({ hasText: `${name}: Consent saved` }),
  ).toBeVisible();
}
async function accept(page) {
  await page.getByLabel("Available passenger seats, excluding you").fill("3");
  await page
    .getByLabel(
      "I can accommodate all 2 booster seats and 0 child seats required for these riders.",
    )
    .check();
  await page
    .getByLabel(
      "I explicitly accept driving this ride with this vehicle and available passenger capacity.",
    )
    .check();
  await page
    .getByRole("button", { name: "Accept as driver", exact: true })
    .click();
  await expect(
    page.getByText("Driver acceptance: Accepted", { exact: false }),
  ).toBeVisible();
}
async function replacement(page, name) {
  await expandDetails(page);
  await openAction(page, "Review driver change");
  const f = page.locator('[role="form"]').filter({
    has: page.getByRole("button", {
      name: "Request replacement",
      exact: true,
    }),
  });
  await f.getByLabel("Replacement driver and registered vehicle").selectOption({
    label: `${name} · ${name === "R7 Guardian A" ? "R7 candidate car" : "R7 original van"} · 3 passenger seats`,
  });
  await f
    .getByLabel(
      "I request a replacement with fresh driver acceptance and consent for every enrolled child.",
    )
    .check();
  await f
    .getByRole("button", { name: "Request replacement", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page
      .getByRole("dialog", { name: "Review driver change", exact: true })
      .getByRole("status"),
  ).toContainText("Saved request pending");
  await closeAction(page, "Review driver change");
  await expect(
    page.getByText("Replacement candidate · pending", { exact: false }),
  ).toBeVisible();
}

test("R7 real adults preserve optional swaps, reset unavailable consent and persist replacement across independent sessions", async ({
  browser,
}) => {
  const a = await account(browser, "r7-a"),
    b = await account(browser, "r7-b"),
    d = await account(browser, "r7-driver"),
    second = await browser.newContext(),
    historySession = await browser.newContext();
  try {
    await captureState(a.page, "empty");
    await family(a.page, "R7 family A", "R7 Guardian A");
    await family(b.page, "R7 family B", "R7 Guardian B");
    await family(d.page, "R7 driver family", "R7 original driver");
    await openAction(a.page, "Create a circle");
    await a.page.getByLabel("Circle name").fill("R7 circle");
    await a.page
      .getByRole("button", { name: "Create circle", exact: true })
      .click();
    await a.page.getByRole("link", { name: "Open saved membership" }).click();
    await expect(
      a.page.getByRole("heading", { name: "R7 circle", exact: true }),
    ).toBeVisible();
    const circle = a.page.url();
    await join(a, b, circle, "R7 family B");
    await join(a, d, circle, "R7 driver family");
    await child(a.page, "R7 child A");
    await child(b.page, "R7 child B");
    await vehicle(a.page, "R7 candidate car");
    await vehicle(d.page, "R7 original van");
    await visit(a.page, "/app/rides/new");
    for (const [label, value] of [
      ["Pickup summary", "R7 neighborhood"],
      ["Drop-off summary", "R7 activity"],
      ["Exact pickup", "Private R7 pickup"],
      ["Exact drop-off", "Private R7 destination"],
      ["IANA timezone", "UTC"],
      ["Pickup time", "2028-09-01T14:00"],
      ["Drop-off time", "2028-09-01T15:00"],
    ])
      await a.page.getByLabel(label, { exact: true }).fill(value);
    await a.page.getByLabel("R7 child A", { exact: true }).check();
    await a.page.getByLabel("R7 family B", { exact: true }).check();
    await a.page
      .getByRole("button", { name: "Create ride", exact: true })
      .click();
    await a.page.getByRole("link", { name: "Open saved result" }).click();
    await expect(
      a.page.getByRole("heading", {
        name: "R7 neighborhood → R7 activity",
        exact: true,
      }),
    ).toBeVisible();
    const ride = a.page.url();
    await visit(b.page, ride);
    await b.page.getByLabel("R7 child B", { exact: true }).check();
    await b.page
      .getByRole("button", { name: "Join with own riders", exact: true })
      .click();
    await expect(
      b.page.getByText("Private R7 pickup", { exact: true }),
    ).toBeVisible();
    await refresh(a.page);
    await captureState(a.page, "uncovered");
    const nom = a.page.locator('[role="form"]').filter({
      has: a.page.getByRole("button", {
        name: "Nominate driver",
        exact: true,
      }),
    });
    await nom.getByLabel("Driver and registered vehicle").selectOption({
      label: "R7 original driver · R7 original van · 3 passenger seats",
    });
    await nom
      .getByLabel(
        "I nominate this adult and vehicle for this ride’s current riders and plan.",
      )
      .check();
    await nom
      .getByRole("button", { name: "Nominate driver", exact: true })
      .click();
    await expect(
      a.page.getByText("Awaiting confirmation", { exact: true }),
    ).toBeVisible();
    await captureState(a.page, "pending", "Driver and assignment");
    await visit(d.page, ride);
    await accept(d.page);
    await refresh(a.page);
    await approve(a.page, "R7 child A");
    await refresh(b.page);
    await approve(b.page, "R7 child B");
    await refresh(a.page);
    await captureState(a.page, "confirmed", "Driver and assignment");
    await replacement(a.page, "R7 Guardian A");
    await expect(
      a.page.getByText("Optional driver swap", { exact: true }),
    ).toBeVisible();
    await expect(
      a.page.getByText("Current driver:", { exact: false }),
    ).toContainText("R7 original driver");
    await expect(a.page.getByTestId("driver-summary")).toContainText(
      "R7 Guardian A · R7 candidate car",
    );
    if (process.env.POOL_BASELINE !== "1")
      await expect(
        a.page.getByText("Replacement candidate · pending", { exact: true }),
      ).toBeVisible();
    await expandDetails(a.page);
    await a.page
      .getByLabel(
        "I cancel this nomination. An available original driver stays assigned.",
      )
      .check();
    await a.page
      .getByRole("button", { name: "Cancel driver proposal", exact: true })
      .click();
    await expect(
      a.page.getByText("Replacement candidate · cancelled", { exact: false }),
    ).toBeVisible();
    await expect(a.page.getByText("Confirmed", { exact: true })).toBeVisible();
    await captureState(a.page, "closed-swap", "Driver and assignment");
    // Closed candidate replies never change the still-available original assignment.
    await refresh(a.page);
    await replacement(a.page, "R7 Guardian A");
    await a.page
      .getByRole("button", { name: "Decline driving", exact: true })
      .click();
    await expect(
      a.page.getByText("Replacement candidate · declined", { exact: false }),
    ).toBeVisible();
    await captureState(a.page, "declined", "Driver and assignment");
    await replacement(a.page, "R7 Guardian A");
    // A real database deadline expires without a scheduler or a simulated browser clock.
    // Cancel the default-deadline request, then create a fresh short-lived one.
    await expandDetails(a.page);
    await a.page
      .getByLabel(
        "I cancel this nomination. An available original driver stays assigned.",
      )
      .check();
    await a.page
      .getByRole("button", { name: "Cancel driver proposal", exact: true })
      .click();
    await expect(
      a.page.getByText("Replacement candidate · cancelled", { exact: false }),
    ).toBeVisible();
    await openAction(a.page, "Review driver change");
    const expiring = a.page.locator('[role="form"]').filter({
      has: a.page.getByRole("button", {
        name: "Request replacement",
        exact: true,
      }),
    });
    await expiring
      .getByLabel("Replacement driver and registered vehicle")
      .selectOption({
        label: "R7 Guardian A · R7 candidate car · 3 passenger seats",
      });
    // Chromium omits zero seconds when serializing datetime-local values.
    // Playwright requires the supplied string to match that canonical form.
    await expiring
      .getByLabel("Review deadline in UTC")
      .fill(
        new Date(Date.now() + 6000)
          .toISOString()
          .slice(0, 19)
          .replace(/:00$/, ""),
      );
    await expiring.getByRole("checkbox").check();
    await expiring
      .getByRole("button", { name: "Request replacement", exact: true })
      .click();
    await expect(
      a.page
        .getByRole("dialog", { name: "Review driver change", exact: true })
        .getByRole("status"),
    ).toContainText("Saved request pending");
    await closeAction(a.page, "Review driver change");
    await expect(
      a.page.getByText("Replacement candidate · pending", { exact: false }),
    ).toBeVisible();
    await expect
      .poll(
        async () => {
          await refresh(a.page);
          return a.page
            .getByText("Replacement candidate · expired", { exact: false })
            .count();
        },
        { timeout: 15000 },
      )
      .toBe(1);
    await expect(a.page.getByText("Confirmed", { exact: true })).toBeVisible();
    await expect(
      a.page.getByRole("button", { name: "Accept as driver", exact: true }),
    ).toHaveCount(0);
    await captureState(a.page, "expired", "Driver and assignment");
    await refresh(a.page);
    await replacement(a.page, "R7 Guardian A");
    await accept(a.page);
    await approve(a.page, "R7 child A");
    await visit(a.page, "/app/attention");
    await expect(
      a.page.getByRole("heading", { name: "Your driver replies" }),
    ).toBeVisible();
    await expect(
      a.page
        .getByText("R7 neighborhood → R7 activity", { exact: true })
        .first(),
    ).toBeVisible();
    await refresh(d.page);
    await expect(
      d.page.getByRole("button", { name: "Withdraw as driver", exact: true }),
    ).toBeVisible();
    await d.page
      .getByLabel("I withdraw and leave this ride needing a driver.")
      .check();
    await d.page
      .getByRole("button", { name: "Withdraw as driver", exact: true })
      .click();
    await expect(
      d.page.getByRole("heading", { name: "Ride unavailable", exact: true }),
    ).toBeVisible();
    await visit(a.page, ride);
    await expect(
      a.page.getByText("Unassigned — needs a driver", { exact: true }),
    ).toBeVisible();
    await replacement(a.page, "R7 Guardian A");
    await expect(
      a.page.getByText("Unavailable-driver replacement", { exact: true }),
    ).toBeVisible();
    await expect(
      a.page.getByText("Child consents: 0 of 2", { exact: false }),
    ).toBeVisible();
    await expect(
      a.page.getByText("Driver acceptance: Required", { exact: false }),
    ).toBeVisible();
    // Actual callable driver response replay under a different participant cannot impersonate A.
    await a.page
      .getByLabel("Available passenger seats, excluding you")
      .fill("3");
    await a.page
      .getByLabel(
        "I can accommodate all 2 booster seats and 0 child seats required for these riders.",
      )
      .check();
    await a.page
      .getByLabel(
        "I explicitly accept driving this ride with this vehicle and available passenger capacity.",
      )
      .check();
    await replayDenied(a.page, b.context, () =>
      a.page
        .getByRole("button", { name: "Accept as driver", exact: true })
        .click(),
    );
    await visit(a.page, ride);
    await accept(a.page);
    await approve(a.page, "R7 child A");
    await approve(a.page, "R7 child A");
    await expect(
      a.page.getByText("Child consents: 1 of 2", { exact: false }),
    ).toBeVisible();
    const independent = await second.newPage();
    await visit(independent, "/sign-in");
    await independent.getByLabel("Email address").fill(b.email);
    await independent.getByLabel("Password", { exact: true }).fill(password);
    await independent
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await expect(independent).toHaveURL(/\/app$/);
    await visit(independent, ride);
    await expect(
      independent.getByText("Awaiting confirmation", { exact: true }),
    ).toBeVisible();
    await expect(
      independent.getByText("There is no confirmed driver.", { exact: false }),
    ).toBeVisible();
    const cf = independent.locator('[role="form"]').filter({
      has: independent.getByRole("button", {
        name: "Approve driver for selected children",
        exact: true,
      }),
    });
    await cf.getByLabel("R7 child B", { exact: true }).check();
    await cf
      .getByLabel(
        "I explicitly consent to this driver, vehicle and plan for my selected children.",
      )
      .check();
    await replayDenied(independent, a.context, () =>
      cf
        .getByRole("button", {
          name: "Approve driver for selected children",
          exact: true,
        })
        .click(),
    );
    await visit(independent, ride);
    await independent.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        independent.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      )
      .toBe(true);
    await approve(independent, "R7 child B");
    await expect(
      independent.getByText("Confirmed", { exact: true }),
    ).toBeVisible();
    for (const page of [a.page, b.page, independent]) {
      await visit(page, ride);
      await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
      await expect(
        page.getByText("Replacement confirmed.", { exact: true }),
      ).toBeVisible();
      await openAction(page, "Review driver change");
      await expect(
        page.getByRole("heading", {
          name: "Replacement activity",
          exact: true,
        }),
      ).toBeVisible();
      await closeAction(page, "Review driver change");
    }
    // A second optional swap succeeds only with the new candidate's real acceptance and both families.
    await replacement(a.page, "R7 original driver");
    await visit(d.page, "/app/driving?pending=1");
    await d.page
      .getByRole("link", { name: "Open ride details", exact: true })
      .click();
    await accept(d.page);
    await refresh(a.page);
    await approve(a.page, "R7 child A");
    await refresh(b.page);
    await approve(b.page, "R7 child B");
    await refresh(d.page);
    await expect(
      d.page.getByText("Replacement confirmed.", { exact: true }),
    ).toBeVisible();
    await expect(
      d.page.getByText("Private R7 pickup", { exact: true }),
    ).toBeVisible();
    // An unsuccessful new swap must preserve the actual driver's completed page and history.
    const journey = (page, name) =>
      page.getByRole("article", { name: `Journey for ${name}`, exact: true });
    async function report(page, name, button) {
      const form = journey(page, name)
        .locator('[role="form"]')
        .filter({
          has: page.getByRole("button", { name: button, exact: true }),
        });
      await form.getByRole("checkbox").check();
      await form.getByRole("button", { name: button, exact: true }).click();
    }
    for (const [parent, name] of [
      [a, "R7 child A"],
      [b, "R7 child B"],
    ]) {
      await visit(parent.page, ride);
      const article = journey(parent.page, name);
      await article
        .getByLabel(`Designated guardian for ${name}`)
        .selectOption({ index: 1 });
      await article.getByRole("checkbox").check();
      await article
        .getByRole("button", { name: "Save designated guardian", exact: true })
        .click();
      await expect(article.getByRole("status")).toContainText(
        "Designated guardian saved",
      );
    }
    await replacement(a.page, "R7 Guardian A");
    await visit(d.page, ride);
    for (const name of ["R7 child A", "R7 child B"]) {
      await report(d.page, name, "Report pickup");
      await expect(
        journey(d.page, name).getByText("Picked up", { exact: true }),
      ).toBeVisible();
      await report(d.page, name, "Report arrival");
      await expect(
        journey(d.page, name).getByText("Awaiting guardian receipt", {
          exact: true,
        }),
      ).toBeVisible();
    }
    await visit(a.page, ride);
    await captureState(a.page, "awaiting-handoff", "Pickup and handoffs");
    for (const [parent, name] of [
      [a, "R7 child A"],
      [b, "R7 child B"],
    ]) {
      await visit(parent.page, ride);
      await report(parent.page, name, "Confirm child received");
      await expect(
        journey(parent.page, name).getByText("Handoff completed", {
          exact: true,
        }),
      ).toBeVisible();
    }
    await visit(d.page, ride);
    await expect(
      d.page.getByText("Ride completed — every child’s handoff is confirmed.", {
        exact: true,
      }),
    ).toBeVisible();
    await captureState(d.page, "completed", "Pickup and handoffs");
    await expect(
      d.page.getByRole("heading", { name: "Ride activity", exact: true }),
    ).toBeVisible();
    await expect(
      d.page.getByText("Handoff completed", { exact: true }),
    ).toHaveCount(2);
    await expect(
      d.page.getByRole("button", {
        name: /Report pickup|Report arrival|Withdraw as driver/,
      }),
    ).toHaveCount(0);
    await visit(a.page, "/app/schedule?date=2028-09-01&timezone=UTC");
    await expect(
      a.page.getByText("Trip driver: R7 original driver", { exact: true }),
    ).toBeVisible();
    await expect(
      a.page.getByText("Ride completed", { exact: true }),
    ).toBeVisible();
    const historyPage = await historySession.newPage();
    await visit(historyPage, "/sign-in");
    await historyPage.getByLabel("Email address").fill(d.email);
    await historyPage.getByLabel("Password", { exact: true }).fill(password);
    await historyPage
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await expect(historyPage).toHaveURL(/\/app$/);
    await visit(historyPage, "/app/driving");
    await historyPage
      .getByRole("link", { name: "Open ride details", exact: true })
      .click();
    await expect(historyPage.getByRole("heading", { level: 1 })).toHaveText(
      "R7 neighborhood → R7 activity",
    );
    await expandDetails(historyPage);
    await expect(
      historyPage.getByRole("heading", { name: "Ride activity", exact: true }),
    ).toBeVisible();
    await expect(
      historyPage.getByText("Handoff completed", { exact: true }),
    ).toHaveCount(2);
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
