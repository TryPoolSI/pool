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
import { test, expect } from "@playwright/test";
async function join(inviter, recipient, circleUrl, familyName) {
  await visit(inviter.page, circleUrl);
  const link = await invitation(inviter.page, recipient.email, "circle");
  await openAndCheck(recipient.page, link);
  await recipient.page
    .getByLabel("Your display name")
    .fill("Driver journey adult");
  await recipient.page
    .getByLabel("Family to join the circle")
    .selectOption({ label: familyName });
  await recipient.page
    .getByLabel("I explicitly accept this circle family membership.")
    .check();
  await recipient.page
    .getByRole("button", { name: "Accept invitation", exact: true })
    .click();
  await expect(recipient.page.getByRole("status")).toContainText(
    "Membership accepted",
  );
}
async function addChild(page, name, seat) {
  await visit(page, "/app/children");
  if (
    await page.getByRole("button", { name: "Add a child", exact: true }).count()
  )
    await openAction(page, "Add a child");
  const f = page.locator('[role="form"]').filter({
    has: page.getByRole("button", { name: "Save child", exact: true }),
  });
  await f.getByLabel("Child display name").fill(name);
  await f.getByLabel("Seat requirement").selectOption(seat);
  await f.getByRole("button", { name: "Save child", exact: true }).click();
  await expect(f.getByRole("status")).toContainText("Saved");
  await refresh(page);
}
async function nominate(page, rideUrl) {
  await visit(page, rideUrl);
  if (
    !(await page
      .getByRole("button", { name: "Nominate driver", exact: true })
      .count())
  )
    await openAction(page, "Review driver change");
  await expect(
    page.getByRole("button", {
      name: /^(Request replacement|Nominate driver)$/,
    }),
  ).toBeVisible();
  const replacement = page.getByRole("button", {
    name: "Request replacement",
    exact: true,
  });
  if (await replacement.count()) {
    const form = page.locator('[role="form"]').filter({ has: replacement });
    await form
      .getByLabel("Replacement driver and registered vehicle")
      .selectOption({
        label: "Dedicated driver · Journey van · 3 passenger seats",
      });
    await form
      .getByLabel(
        "I request a replacement with fresh driver acceptance and consent for every enrolled child.",
      )
      .check();
    await replacement.click();
    await expect(
      page
        .getByRole("dialog", { name: "Review driver change", exact: true })
        .getByRole("status"),
    ).toContainText("Saved request pending");
    await closeAction(page, "Review driver change");
    await expect(
      page.getByText("Awaiting confirmation", { exact: true }),
    ).toBeVisible();
    return;
  }
  const f = page.locator('[role="form"]').filter({
    has: page.getByRole("button", { name: "Nominate driver", exact: true }),
  });
  const select = f.getByLabel("Driver and registered vehicle");
  const option = select
    .locator("option")
    .filter({ hasText: "Dedicated driver · Journey van" });
  await select.selectOption(await option.getAttribute("value"));
  await f
    .getByLabel(
      "I nominate this adult and vehicle for this ride’s current riders and plan.",
    )
    .check();
  await f.getByRole("button", { name: "Nominate driver", exact: true }).click();
  await expect(
    page.getByText("Awaiting confirmation", { exact: true }),
  ).toBeVisible();
}
async function consent(page, name) {
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
      "I can accommodate all 1 booster seats and 1 child seats required for these riders.",
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

test("M1: independent guardians and proposed-only driver explicitly confirm, consent, reload, withdraw and revoke", async ({
  browser,
}) => {
  const a = await account(browser, "m1-a"),
    b = await account(browser, "m1-b"),
    d = await account(browser, "m1-driver"),
    outside = await account(browser, "m1-outside");
  const second = await browser.newContext();
  try {
    await family(a.page, "Journey family A", "Guardian A");
    await family(b.page, "Journey family B", "Guardian B");
    await family(d.page, "Journey driver family", "Dedicated driver");
    await family(outside.page, "Journey outside family", "Outside adult");
    await openAction(a.page, "Create a circle");
    await a.page.getByLabel("Circle name").fill("M1 journey circle");
    await a.page
      .getByRole("button", { name: "Create circle", exact: true })
      .click();
    await a.page.getByRole("link", { name: "Open saved membership" }).click();
    await expect(
      a.page.getByRole("heading", { name: "M1 journey circle", exact: true }),
    ).toBeVisible();
    const circleUrl = a.page.url();
    await join(a, b, circleUrl, "Journey family B");
    await join(a, d, circleUrl, "Journey driver family");
    await addChild(a.page, "Journey A child", "booster");
    await addChild(b.page, "Journey B child", "child-seat");
    await visit(d.page, "/app/vehicles");
    const vehicle = d.page.locator('[role="form"]').filter({
      has: d.page.getByRole("button", { name: "Save vehicle", exact: true }),
    });
    await vehicle.getByLabel("Vehicle label").fill("Journey van");
    await vehicle.getByLabel("Passenger seats, excluding you").fill("3");
    await vehicle
      .getByRole("button", { name: "Save vehicle", exact: true })
      .click();
    await expect(vehicle.getByRole("status")).toContainText("Saved");
    await refresh(d.page);
    await expect(
      d.page.getByRole("heading", { name: "Journey van", exact: true }),
    ).toBeVisible();
    await visit(a.page, "/app/rides/new");
    for (const [label, value] of [
      ["Pickup summary", "Journey neighborhood"],
      ["Drop-off summary", "Journey activity"],
      ["Exact pickup", "111 Private M1 Pickup"],
      ["Exact drop-off", "222 Private M1 Destination"],
      ["IANA timezone", "UTC"],
      ["Pickup time", "2027-09-01T14:00"],
      ["Drop-off time", "2027-09-01T15:00"],
    ])
      await a.page.getByLabel(label, { exact: true }).fill(value);
    await a.page.getByLabel("Journey A child", { exact: true }).check();
    await a.page.getByLabel("Journey family B", { exact: true }).check();
    await a.page
      .getByRole("button", { name: "Create ride", exact: true })
      .click();
    await a.page.getByRole("link", { name: "Open saved result" }).click();
    await expect(
      a.page.getByRole("heading", {
        name: "Journey neighborhood → Journey activity",
        exact: true,
      }),
    ).toBeVisible();
    const rideUrl = a.page.url();
    // Nomination cannot freeze an unanswered family response.
    const nom = a.page.locator('[role="form"]').filter({
      has: a.page.getByRole("button", {
        name: "Nominate driver",
        exact: true,
      }),
    });
    await nom.getByLabel("Driver and registered vehicle").selectOption({
      label: "Dedicated driver · Journey van · 3 passenger seats",
    });
    await nom
      .getByLabel(
        "I nominate this adult and vehicle for this ride’s current riders and plan.",
      )
      .check();
    await nom
      .getByRole("button", { name: "Nominate driver", exact: true })
      .click();
    await expect(nom.getByRole("alert")).toContainText(
      "All families must respond",
    );
    await visit(b.page, rideUrl);
    await b.page.getByLabel("Journey B child", { exact: true }).check();
    await b.page
      .getByRole("button", { name: "Join with own riders", exact: true })
      .click();
    await expect(
      b.page.getByText("111 Private M1 Pickup", { exact: true }),
    ).toBeVisible();
    await nominate(a.page, rideUrl);
    await visit(d.page, "/app/driving?pending=1");
    await expect(
      d.page.getByRole("heading", { name: "Your driving", exact: true }),
    ).toBeVisible();
    await d.page
      .getByRole("link", { name: "Open ride details", exact: true })
      .click();
    await expect(
      d.page.getByText("Only the minimal driver proposal", { exact: false }),
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
    await d.page
      .getByLabel("Available passenger seats, excluding you")
      .fill("3");
    await d.page
      .getByLabel(
        "I can accommodate all 1 booster seats and 1 child seats required for these riders.",
      )
      .check();
    await d.page
      .getByLabel(
        "I explicitly accept driving this ride with this vehicle and available passenger capacity.",
      )
      .check();
    await replayDenied(d.page, outside.context, () =>
      d.page
        .getByRole("button", { name: "Accept as driver", exact: true })
        .click(),
    );
    await visit(d.page, rideUrl);
    await accept(d.page);
    await expect(
      d.page.getByText("Awaiting confirmation", { exact: true }),
    ).toBeVisible();
    await refresh(b.page);
    const cf = b.page.locator('[role="form"]').filter({
      has: b.page.getByRole("button", {
        name: "Approve driver for selected children",
        exact: true,
      }),
    });
    await cf.getByLabel("Journey B child", { exact: true }).check();
    await cf
      .getByLabel(
        "I explicitly consent to this driver, vehicle and plan for my selected children.",
      )
      .check();
    await replayDenied(b.page, a.context, () =>
      cf
        .getByRole("button", {
          name: "Approve driver for selected children",
          exact: true,
        })
        .click(),
    );
    await visit(b.page, rideUrl);
    await refresh(a.page);
    await consent(a.page, "Journey A child");
    await expect(
      a.page.getByText("Awaiting confirmation", { exact: true }),
    ).toBeVisible();
    await consent(b.page, "Journey B child");
    for (const person of [a, b, d]) {
      await refresh(person.page);
      await expect(
        person.page.getByText("Confirmed", { exact: true }),
      ).toBeVisible();
      await expect(
        person.page.getByText("111 Private M1 Pickup", { exact: true }),
      ).toBeVisible();
    }
    await visit(a.page, "/app/schedule?date=2027-09-01&timezone=UTC");
    await expect(
      a.page.getByText("Driver confirmed", { exact: true }),
    ).toBeVisible();
    const independent = await second.newPage();
    await visit(independent, "/sign-in");
    await independent.getByLabel("Email address").fill(b.email);
    await independent.getByLabel("Password", { exact: true }).fill(password);
    await independent
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await expect(independent).toHaveURL(/\/app$/);
    await visit(independent, rideUrl);
    await expect(
      independent.getByText("Confirmed", { exact: true }),
    ).toBeVisible();
    // Vehicle changes fail while confirmed.
    await visit(d.page, "/app/vehicles");
    await openAction(d.page, "Edit vehicle");
    const update = d.page.locator('[role="form"]').filter({
      has: d.page.getByRole("button", {
        name: "Update vehicle",
        exact: true,
      }),
    });
    await update.getByLabel("Passenger seats, excluding you").fill("2");
    await update
      .getByRole("button", { name: "Update vehicle", exact: true })
      .click();
    await expect(update.getByRole("alert")).toContainText(
      "Resolve the current proposal",
    );
    await visit(d.page, rideUrl);
    await d.page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        d.page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      )
      .toBe(true);
    await d.page
      .getByLabel("I withdraw and leave this ride needing a driver.")
      .check();
    await d.page
      .getByRole("button", { name: "Withdraw as driver", exact: true })
      .focus();
    await d.page.keyboard.press("Enter");
    await expect(
      d.page.getByText("Unassigned — needs a driver", { exact: true }),
    ).toBeVisible();
    await expect(
      d.page.getByText("111 Private M1 Pickup", { exact: true }),
    ).toHaveCount(0);
    await nominate(a.page, rideUrl);
    await expect(
      a.page.getByText("Child consents: 0 of 2", { exact: false }),
    ).toBeVisible();
    await refresh(d.page);
    await accept(d.page);
    await refresh(a.page);
    await consent(a.page, "Journey A child");
    await refresh(b.page);
    await consent(b.page, "Journey B child");
    await expandDetails(b.page);
    const revoke = b.page.locator('[role="form"]').filter({
      has: b.page.getByRole("button", {
        name: "Revoke selected child consent",
        exact: true,
      }),
    });
    await revoke.getByLabel("Journey B child", { exact: true }).check();
    await revoke
      .getByLabel("I revoke consent and leave this ride needing a driver.")
      .check();
    await revoke
      .getByRole("button", {
        name: "Revoke selected child consent",
        exact: true,
      })
      .click();
    await expect(
      b.page.getByText("Unassigned — needs a driver", { exact: true }),
    ).toBeVisible();
    for (const page of [a.page, b.page, d.page, independent]) {
      await refresh(page);
      await expect(
        page.getByText("Unassigned — needs a driver", { exact: true }).first(),
      ).toBeVisible();
    }
    await visit(a.page, "/app/attention");
    await expect(
      a.page.getByText("Journey neighborhood → Journey activity", {
        exact: true,
      }),
    ).toBeVisible();
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
