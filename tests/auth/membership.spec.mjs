import {
  visit,
  refresh,
  openAction,
  account,
  family,
  invitation,
  openAndCheck,
  submitSignIn,
} from "./helpers.mjs";
import { test, expect } from "@playwright/test";

test("two real families and a guardian use manual invitations, explicit acceptance, persisted rosters and removal", async ({
  browser,
}) => {
  const owner = await account(browser, "owner");
  const other = await account(browser, "other");
  const guardian = await account(browser, "guardian");
  try {
    const ownerFamilyUrl = await family(
      owner.page,
      "Oak browser family",
      "Oak adult",
    );
    const otherFamilyUrl = await family(
      other.page,
      "Elm browser family",
      "Elm adult",
    );
    await openAction(owner.page, "Create a circle");
    await owner.page.getByLabel("Circle name").fill("Morning browser circle");
    await owner.page
      .getByRole("button", { name: "Create circle", exact: true })
      .click();
    await owner.page
      .getByRole("link", { name: "Open saved membership" })
      .click();
    await expect(owner.page.getByRole("heading", { level: 1 })).toHaveText(
      "Morning browser circle",
    );
    const circleUrl = owner.page.url();
    const circleLink = await invitation(owner.page, other.email, "circle");
    await owner.context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await owner.page
      .getByRole("button", { name: "Copy invitation link", exact: true })
      .click();
    await expect(
      owner.page.getByRole("button", { name: "Copied", exact: true }),
    ).toBeVisible();
    expect(
      (await owner.page.evaluate(() => navigator.clipboard.readText())) ===
        circleLink,
    ).toBe(true);
    await openAndCheck(guardian.page, circleLink);
    await expect(guardian.page.locator('[role="alert"]')).toContainText(
      "unavailable to this account",
    );
    await openAndCheck(other.page, circleLink);
    await expect(
      other.page.getByRole("heading", {
        name: "Join circle: Morning browser circle",
      }),
    ).toBeVisible();
    await expect(other.page.getByRole("option", { name: "Create a new family" })).toHaveCount(0);
    await other.page.getByLabel("Your display name").fill("Elm adult");
    await other.page
      .getByLabel("Family to join the circle")
      .selectOption({ label: "Elm browser family" });
    await other.page
      .getByLabel("I explicitly accept this circle family membership.")
      .check();
    await other.page
      .getByRole("button", { name: "Accept invitation", exact: true })
      .click();
    await expect(other.page.getByRole("heading", { level: 1 })).toHaveText(
      "Elm browser family",
    );
    await visit(other.page, circleUrl);
    await refresh(other.page);
    await expect(
      other.page.getByText("Oak browser family", { exact: false }).first(),
    ).toBeVisible();
    await expect(
      other.page.getByText("Elm browser family", { exact: false }).first(),
    ).toBeVisible();
    await expect(
      other.page.getByRole("button", { name: "Create circle invitation" }),
    ).toHaveCount(0);
    await visit(owner.page, circleUrl);
    const guardianCircleLink = await invitation(owner.page, guardian.email, "circle");
    await openAndCheck(guardian.page, guardianCircleLink);
    await expect(guardian.page.getByRole("option", { name: "Create a new family" })).toBeAttached();
    await expect(guardian.page.getByLabel("Family name", { exact: true })).toBeVisible();
    await visit(other.page, ownerFamilyUrl);
    await expect(
      other.page.getByRole("heading", { name: "Membership unavailable" }),
    ).toBeVisible();
    await visit(owner.page, ownerFamilyUrl);
    const guardianLink = await invitation(
      owner.page,
      guardian.email,
      "guardian",
    );
    await openAndCheck(guardian.page, guardianLink);
    await guardian.page.getByLabel("Your display name").fill("Oak guardian");
    await guardian.page
      .getByLabel("I explicitly accept this family guardian membership.")
      .check();
    await guardian.page
      .getByRole("button", { name: "Accept invitation", exact: true })
      .click();
    await expect(guardian.page.getByRole("heading", { level: 1 })).toHaveText(
      "Oak browser family",
    );
    await expect(
      guardian.page.getByText("Oak adult · owner", { exact: false }).first(),
    ).toBeVisible();
    await expect(
      guardian.page.getByRole("button", { name: "Create guardian invitation" }),
    ).toHaveCount(0);
    await refresh(guardian.page);
    await expect(
      guardian.page
        .getByText("Oak guardian · guardian", { exact: false })
        .first(),
    ).toBeVisible();
    await visit(guardian.page, "/app");
    await expect(guardian.page.getByRole("link", { name: /Oak browser family/ })).toBeVisible();
    await expect(guardian.page.getByRole("button", { name: /^Create (a )?family$/ })).toHaveCount(0);

    await visit(other.page, otherFamilyUrl);
    const conflictingLink = await invitation(other.page, guardian.email, "guardian");
    await openAndCheck(guardian.page, conflictingLink);
    await guardian.page.getByLabel("Your display name").fill("Oak guardian");
    await guardian.page.getByRole("checkbox").check();
    await guardian.page.getByRole("button", { name: "Accept invitation", exact: true }).click();
    const conflict = guardian.page.getByRole("alert");
    await expect(conflict).toContainText("This invitation is still unused");
    await expect(conflict).toContainText("The last owner and any circle coordinator must stay");
    await refresh(guardian.page);
    await expect(guardian.page.getByLabel("Invitation link")).toHaveValue(conflictingLink);
    await guardian.page.getByRole("button", { name: "Check invitation" }).click();
    await expect(guardian.page.getByRole("heading", { name: "Join family: Elm browser family" })).toBeVisible();

    await openAndCheck(guardian.page, guardianCircleLink);
    await expect(guardian.page.getByRole("status")).toContainText("Ask the circle coordinator");
    await expect(guardian.page.getByRole("button", { name: "Accept invitation", exact: true })).toHaveCount(0);
    // Reuse fails, and revocation is visible without exposing invitation email lists.
    await openAndCheck(guardian.page, guardianLink);
    await expect(guardian.page.locator('[role="alert"]')).toContainText(
      "already been used",
    );
    await refresh(owner.page);
    const revokedLink = await invitation(
      owner.page,
      guardian.email,
      "guardian",
    );
    await refresh(owner.page);
    await owner.page
      .getByRole("button", { name: "Revoke invitation", exact: true })
      .click();
    await openAndCheck(guardian.page, revokedLink);
    await expect(guardian.page.locator('[role="alert"]')).toContainText(
      "revoked",
    );
    await refresh(owner.page);
    const guardianRow = owner.page
      .getByRole("listitem")
      .filter({ hasText: "Oak guardian · guardian" });
    await guardianRow.getByRole("checkbox").check();
    await guardianRow
      .getByRole("button", { name: "Remove guardian", exact: true })
      .click();
    await expect(guardianRow).toHaveCount(0);
    await visit(guardian.page, ownerFamilyUrl);
    await expect(
      guardian.page.getByRole("heading", { name: "Membership unavailable" }),
    ).toBeVisible();
    await visit(owner.page, circleUrl);
    const otherRow = owner.page
      .getByRole("listitem")
      .filter({ hasText: "Elm browser family" });
    await otherRow.getByRole("checkbox").check();
    await otherRow
      .getByRole("button", { name: "Remove family from circle", exact: true })
      .click();
    await expect(otherRow).toHaveCount(0);
    await visit(other.page, circleUrl);
    await expect(
      other.page.getByRole("heading", { name: "Membership unavailable" }),
    ).toBeVisible();
    await visit(other.page, otherFamilyUrl);
    await other.page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        other.page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await other.page.keyboard.press("Tab");
    expect(
      await other.page.evaluate(() => document.activeElement?.tagName),
    ).not.toBe("BODY");
  } finally {
    await Promise.all([
      owner.context.close(),
      other.context.close(),
      guardian.context.close(),
    ]);
  }
});

test("Profile retries a failed membership read and creates directly into My family", async ({
  browser,
}) => {
  const { context, page } = await account(browser, "profile-create");
  try {
    await page.setViewportSize({ width: 1200, height: 900 });
    const membershipRequest = (url) =>
      url.pathname === "/rest/v1/family_members";
    await page.route(membershipRequest, (route) =>
      route.fulfill({
        status: 400,
        headers: { "access-control-allow-origin": "*" },
        json: { message: "Membership read failed" },
      }),
    );
    await page.reload();
    await expect(page.getByRole("alert")).toHaveText(
      "Your family membership could not be loaded.",
    );
    await expect(
      page.getByRole("button", { name: "Create a family", exact: true }),
    ).toHaveCount(0);
    await page.unroute(membershipRequest);
    await page.getByRole("button", { name: "Retry membership" }).click();
    await expect(
      page.getByRole("link", { name: "Join a family", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Create a family", exact: true })
      .click();
    await expect(
      page.getByText(
        "Your name is the personal name other guardians will see.",
      ),
    ).toBeVisible();
    await page.getByLabel("Your name", { exact: true }).fill("Profile adult");
    await page
      .getByLabel("Family name", { exact: true })
      .fill("Profile family");
    await page
      .getByRole("button", { name: "Create family", exact: true })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Profile family",
    );
    await expect(page.getByText("Profile adult · owner")).toBeVisible();
    await page.getByRole("link", { name: "Home", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Home");
    await page.getByRole("link", { name: "My family", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Profile family",
    );
  } finally {
    await context.close();
  }
});

test("a copied guardian link survives sign-in and account switching", async ({
  browser,
}) => {
  const owner = await account(browser, "copied-owner");
  const recipient = await account(browser, "copied-recipient");
  const wrong = await account(browser, "copied-wrong");
  const signedOut = await browser.newContext();
  try {
    const familyUrl = await family(
      owner.page,
      "Copied-link family",
      "Inviting adult",
    );
    const link = await invitation(owner.page, recipient.email, "guardian");
    await owner.context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await owner.page
      .getByRole("button", { name: "Copy invitation link", exact: true })
      .click();
    const copied = await owner.page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(copied).toBe(link);

    await recipient.page
      .getByRole("link", { name: "Join a family", exact: true })
      .click();
    const field = recipient.page.getByLabel("Invitation link");
    await field.fill("https://example.test/app/rides/new#invalid");
    await recipient.page
      .getByRole("button", { name: "Check invitation" })
      .click();
    await expect(recipient.page.getByRole("alert")).toContainText(
      "Paste the full Pool invitation link",
    );
    await field.fill(copied);
    await recipient.page
      .getByRole("button", { name: "Check invitation" })
      .click();
    await expect(
      recipient.page.getByRole("heading", {
        name: "Join family: Copied-link family",
      }),
    ).toBeVisible();

    const page = await signedOut.newPage();
    await page.goto("/sign-in");
    await page
      .getByRole("button", { name: "Have an invitation link?" })
      .click();
    await page.getByLabel("Invitation link").fill(copied);
    await page.getByRole("button", { name: "Use invitation link" }).click();
    await expect(
      page.getByText("Sign in with the email address on your invitation."),
    ).toBeVisible();
    await submitSignIn(page, wrong.email);
    await expect(page).toHaveURL(/\/app\/invitations$/);
    await expect(page.getByLabel("Invitation link")).toHaveValue(copied);
    await page.getByRole("button", { name: "Check invitation" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "unavailable to this account",
    );
    await expect(
      page.getByText(`You’re signed in as ${wrong.email}.`, { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Copied-link family/ }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Use a different account" }).click();
    await submitSignIn(page, recipient.email);
    await expect(page).toHaveURL(/\/app\/invitations$/);
    await expect(page.getByLabel("Invitation link")).toHaveValue(copied);
    await expect(
      page.getByRole("button", { name: "Accept invitation", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Check invitation" }).click();
    await page.getByLabel("Your display name").fill("Invited adult");
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Accept invitation", exact: true })
      .click();
    await expect(page).toHaveURL(familyUrl);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Copied-link family",
    );
    await expect(page.getByText("Invited adult · guardian")).toBeVisible();
  } finally {
    await Promise.all([
      owner.context.close(),
      recipient.context.close(),
      wrong.context.close(),
      signedOut.close(),
    ]);
  }
});

test("an adult can create their own family while accepting a circle invitation", async ({
  browser,
}) => {
  const owner = await account(browser, "circle-onboarding-owner");
  const recipient = await account(browser, "circle-onboarding-recipient");
  try {
    await family(owner.page, "Coordinating family", "Circle coordinator");
    await openAction(owner.page, "Create a circle");
    await owner.page.getByLabel("Circle name").fill("Onboarding circle");
    await owner.page
      .getByRole("button", { name: "Create circle", exact: true })
      .click();
    await owner.page
      .getByRole("link", { name: "Open saved membership" })
      .click();
    await expect(owner.page.getByRole("heading", { level: 1 })).toHaveText(
      "Onboarding circle",
    );
    const circleUrl = owner.page.url();
    await openAndCheck(
      recipient.page,
      await invitation(owner.page, recipient.email, "circle"),
    );
    await expect(
      recipient.page.getByRole("heading", {
        name: "Join circle: Onboarding circle",
      }),
    ).toBeVisible();
    await recipient.page.getByLabel("Your display name").fill("Circle invitee");
    await recipient.page
      .getByLabel("Family name", { exact: true })
      .fill("New circle family");
    await recipient.page.getByRole("checkbox").check();
    await recipient.page
      .getByRole("button", { name: "Accept invitation", exact: true })
      .click();
    await expect(recipient.page.getByRole("heading", { level: 1 })).toHaveText(
      "New circle family",
    );
    await visit(recipient.page, circleUrl);
    await expect(
      recipient.page.getByText("New circle family", { exact: true }),
    ).toBeVisible();
  } finally {
    await Promise.all([owner.context.close(), recipient.context.close()]);
  }
});
