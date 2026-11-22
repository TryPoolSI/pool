import {
  visit,
  refresh,
  openAction,
  account,
  family,
  invitation,
  openAndCheck,
  joinInvitation,
  joinButton,
  invitationHeading,
  expectToast,
  submitSignIn,
} from "./helpers.mjs";
import { test, expect } from "@playwright/test";

const invitationNotFound =
  "Pool couldn’t find an invitation for this link and this account.";
const notAvailable = (page) =>
  page.getByRole("heading", { level: 1, name: "Not available", exact: true });
const guardians = (page) => page.getByRole("list", { name: "Guardians" });
const families = (page) => page.getByRole("list", { name: "Families" });

async function createCircle(page, name) {
  const dialog = await openAction(page, "Create a circle");
  await dialog.getByLabel("Circle name", { exact: true }).fill(name);
  await dialog
    .getByRole("button", { name: "Create circle", exact: true })
    .click();
  // The new circle opens in place of the family page; nothing else to press.
  await expectToast(page, "Circle created");
  await expect(page).toHaveURL(/\/app\/circles\/[a-f0-9-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return page.url();
}

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
    const circleUrl = await createCircle(owner.page, "Morning browser circle");
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
      invitationNotFound,
    );
    await expect(invitationHeading(guardian.page)).toHaveCount(0);
    await expect(joinButton(guardian.page)).toHaveCount(0);
    await openAndCheck(other.page, circleLink);
    await expect(
      other.page.getByRole("heading", {
        name: "Join circle: Morning browser circle",
      }),
    ).toBeVisible();
    // An adult who owns a family joins with it; no second family is offered.
    await expect(
      other.page.getByLabel("Family name", { exact: true }),
    ).toHaveCount(0);
    await expect(
      other.page.getByText("Elm browser family will join this circle."),
    ).toBeVisible();
    await expect(
      other.page.getByLabel("Your name", { exact: true }),
    ).toHaveCount(0);
    await joinInvitation(other.page, "Morning browser circle");
    await expectToast(other.page, "You joined Morning browser circle");
    await expect(other.page).toHaveURL(otherFamilyUrl);
    await expect(other.page.getByRole("heading", { level: 1 })).toHaveText(
      "Elm browser family",
    );
    await visit(other.page, circleUrl);
    await refresh(other.page);
    await expect(
      families(other.page).getByText("Oak browser family", { exact: true }),
    ).toBeVisible();
    await expect(
      families(other.page).getByText("Elm browser family", { exact: true }),
    ).toBeVisible();
    await expect(
      other.page.getByRole("button", { name: "Invite a family" }),
    ).toHaveCount(0);
    await visit(owner.page, circleUrl);
    const guardianCircleLink = await invitation(owner.page, guardian.email, "circle");
    await openAndCheck(guardian.page, guardianCircleLink);
    // An adult without a family names a new one while joining the circle.
    await expect(
      guardian.page.getByLabel("Your name", { exact: true }),
    ).toBeVisible();
    await expect(guardian.page.getByLabel("Family name", { exact: true })).toBeVisible();
    await visit(other.page, ownerFamilyUrl);
    await expect(notAvailable(other.page)).toBeVisible();
    await visit(owner.page, ownerFamilyUrl);
    const guardianLink = await invitation(
      owner.page,
      guardian.email,
      "guardian",
    );
    await openAndCheck(guardian.page, guardianLink);
    await joinInvitation(guardian.page, "Oak browser family", {
      display: "Oak guardian",
    });
    await expectToast(guardian.page, "You joined Oak browser family");
    await expect(guardian.page).toHaveURL(ownerFamilyUrl);
    await expect(guardian.page.getByRole("heading", { level: 1 })).toHaveText(
      "Oak browser family",
    );
    await expect(
      guardians(guardian.page)
        .getByRole("listitem")
        .filter({ hasText: "Oak adult" }),
    ).toContainText("Owner");
    await expect(
      guardian.page.getByRole("button", { name: "Invite a guardian" }),
    ).toHaveCount(0);
    await refresh(guardian.page);
    const ownRow = guardians(guardian.page)
      .getByRole("listitem")
      .filter({ hasText: "Oak guardian" });
    await expect(ownRow).toContainText("Guardian");
    await expect(ownRow.getByText("You", { exact: true })).toBeVisible();
    await expect(ownRow.getByRole("button")).toHaveCount(0);
    await visit(guardian.page, "/app");
    await expect(guardian.page.getByRole("heading", { level: 1 })).toHaveText(
      "Home",
    );
    await expect(
      guardian.page
        .getByRole("main")
        .getByText("Oak browser family", { exact: true }),
    ).toBeVisible();
    await expect(
      guardian.page.getByRole("link", { name: "My family", exact: true }),
    ).toHaveAttribute("href", new URL(ownerFamilyUrl).pathname);
    await expect(guardian.page.getByRole("button", { name: /^Create (a )?family$/ })).toHaveCount(0);

    await visit(other.page, otherFamilyUrl);
    const conflictingLink = await invitation(other.page, guardian.email, "guardian");
    await openAndCheck(guardian.page, conflictingLink);
    // The account already has a name, so the invitation does not ask again.
    await expect(
      guardian.page.getByLabel("Your name", { exact: true }),
    ).toHaveCount(0);
    await joinInvitation(guardian.page, "Elm browser family");
    const conflict = guardian.page.getByRole("alert");
    await expect(conflict).toContainText("this invitation hasn’t been used");
    await expect(conflict).toContainText(
      "You can’t leave while you’re its only owner or it organizes a circle.",
    );
    await expect(
      guardian.page.getByRole("main").getByRole("link", { name: "My family" }),
    ).toHaveAttribute("href", new URL(ownerFamilyUrl).pathname);
    // The unused invitation is still there after a reload, checked again.
    await refresh(guardian.page);
    await expect(guardian.page.getByRole("heading", { name: "Join family: Elm browser family" })).toBeVisible();
    await expect(
      guardian.page.getByRole("button", { name: "Join Elm browser family", exact: true }),
    ).toBeVisible();

    await openAndCheck(guardian.page, guardianCircleLink);
    await expect(
      guardian.page.getByRole("main").getByRole("status"),
    ).toContainText("Only a family’s owner can add it to a circle.");
    await expect(joinButton(guardian.page)).toHaveCount(0);
    // Reuse fails, and revocation is visible without exposing invitation email lists.
    await openAndCheck(guardian.page, guardianLink);
    await expect(guardian.page.locator('[role="alert"]')).toContainText(
      "expired, was revoked or was already used",
    );
    await expect(joinButton(guardian.page)).toHaveCount(0);
    await refresh(owner.page);
    const revokedLink = await invitation(
      owner.page,
      guardian.email,
      "guardian",
    );
    await refresh(owner.page);
    const pending = owner.page
      .getByRole("list", { name: "Pending invitations" })
      .getByRole("listitem")
      .filter({ hasText: guardian.email });
    await expect(pending).toHaveCount(1);
    await expect(pending).toContainText("Pending");
    await expect(pending).toContainText(/Expires [A-Z][a-z]{2} \d{1,2}/);
    const revoke = await openAction(
      owner.page,
      "Revoke invitation",
      pending.getByRole("button", { name: "Revoke", exact: true }),
    );
    await revoke
      .getByRole("button", { name: "Revoke invitation", exact: true })
      .click();
    await expectToast(owner.page, "Invitation revoked");
    await expect(revoke).toHaveCount(0);
    await expect(pending).toHaveCount(0);
    await openAndCheck(guardian.page, revokedLink);
    await expect(guardian.page.locator('[role="alert"]')).toContainText(
      "This invitation has expired, was revoked or was already used. Ask for a new link.",
    );
    await expect(joinButton(guardian.page)).toHaveCount(0);
    await refresh(owner.page);
    await expect(
      owner.page
        .getByRole("list", { name: "Earlier invitations" })
        .getByRole("listitem")
        .filter({ hasText: "Revoked" }),
    ).toContainText(guardian.email);
    const guardianRow = guardians(owner.page)
      .getByRole("listitem")
      .filter({ hasText: "Oak guardian" });
    const removeGuardian = await openAction(
      owner.page,
      "Remove Oak guardian",
      guardianRow.getByRole("button", { name: "Remove", exact: true }),
    );
    // Removal needs its one plain confirmation.
    await removeGuardian
      .getByRole("button", { name: "Remove guardian", exact: true })
      .click();
    await expect(removeGuardian.getByRole("alert")).toHaveText(
      "Tick “Remove Oak guardian from the family” to continue.",
    );
    await removeGuardian
      .getByLabel("Remove Oak guardian from the family")
      .check();
    await removeGuardian
      .getByRole("button", { name: "Remove guardian", exact: true })
      .click();
    await expectToast(owner.page, "Oak guardian removed");
    await expect(removeGuardian).toHaveCount(0);
    await expect(guardianRow).toHaveCount(0);
    await visit(guardian.page, ownerFamilyUrl);
    await expect(notAvailable(guardian.page)).toBeVisible();
    await visit(owner.page, circleUrl);
    const otherRow = families(owner.page)
      .getByRole("listitem")
      .filter({ hasText: "Elm browser family" });
    const removeFamily = await openAction(
      owner.page,
      "Remove Elm browser family",
      otherRow.getByRole("button", { name: "Remove", exact: true }),
    );
    await removeFamily
      .getByLabel("Remove Elm browser family from Morning browser circle")
      .check();
    await removeFamily
      .getByRole("button", { name: "Remove family", exact: true })
      .click();
    await expectToast(owner.page, "Elm browser family removed");
    await expect(removeFamily).toHaveCount(0);
    await expect(otherRow).toHaveCount(0);
    await visit(other.page, circleUrl);
    await expect(notAvailable(other.page)).toBeVisible();
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
      "Pool couldn’t load your family. Check your connection and try again.",
    );
    await expect(
      page.getByRole("button", { name: "Create family", exact: true }),
    ).toHaveCount(0);
    await page.unroute(membershipRequest);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Welcome to Pool" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: "Join with an invitation link",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Start with your family: the adults and children in your household.",
      ),
    ).toBeVisible();
    // The welcome form is already open: no button to reveal it.
    await page.getByLabel("Your name", { exact: true }).fill("Profile adult");
    await page
      .getByLabel("Family name", { exact: true })
      .fill("Profile family");
    await page
      .getByRole("button", { name: "Create family", exact: true })
      .click();
    await expectToast(page, "Family created");
    await expect(page).toHaveURL(/\/app\/families\/[a-f0-9-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Profile family",
    );
    const ownRow = guardians(page)
      .getByRole("listitem")
      .filter({ hasText: "Profile adult" });
    await expect(ownRow).toContainText("Owner");
    await expect(ownRow.getByText("You", { exact: true })).toBeVisible();
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
      .getByRole("link", { name: "Join with an invitation link", exact: true })
      .click();
    await expect(recipient.page).toHaveURL(/\/app\/invitations$/);
    const field = recipient.page.getByLabel("Invitation link", { exact: true });
    const check = recipient.page.getByRole("button", {
      name: "Check invitation",
      exact: true,
    });
    await field.fill("https://example.test/app/rides/new#invalid");
    await check.click();
    await expect(recipient.page.getByRole("alert")).toContainText(
      "That isn’t a full Pool invitation link.",
    );
    await expect(joinButton(recipient.page)).toHaveCount(0);
    // A complete link is checked as soon as it is pasted.
    await field.fill(copied);
    await expect(
      recipient.page.getByRole("heading", {
        name: "Join family: Copied-link family",
      }),
    ).toBeVisible();
    await expect(check).toHaveCount(0);
    await expect(field).toHaveCount(0);

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
    await expect(page.getByRole("alert")).toContainText(invitationNotFound);
    await expect(page.getByLabel("Invitation link", { exact: true })).toHaveValue(
      copied,
    );
    await expect(
      page.getByText(`You’re signed in as ${wrong.email}.`, { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Copied-link family/ }),
    ).toHaveCount(0);
    await expect(joinButton(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Use a different account" }).click();
    await submitSignIn(page, recipient.email);
    await expect(page).toHaveURL(/\/app\/invitations$/);
    await expect(
      page.getByRole("heading", { name: "Join family: Copied-link family" }),
    ).toBeVisible();
    await joinInvitation(page, "Copied-link family", {
      display: "Invited adult",
    });
    await expectToast(page, "You joined Copied-link family");
    await expect(page).toHaveURL(familyUrl);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Copied-link family",
    );
    await expect(
      guardians(page).getByRole("listitem").filter({ hasText: "Invited adult" }),
    ).toContainText("Guardian");
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
    const circleUrl = await createCircle(owner.page, "Onboarding circle");
    await openAndCheck(
      recipient.page,
      await invitation(owner.page, recipient.email, "circle"),
    );
    await expect(
      recipient.page.getByRole("heading", {
        name: "Join circle: Onboarding circle",
      }),
    ).toBeVisible();
    await joinInvitation(recipient.page, "Onboarding circle", {
      display: "Circle invitee",
      familyName: "New circle family",
    });
    await expectToast(recipient.page, "You joined Onboarding circle");
    await expect(recipient.page.getByRole("heading", { level: 1 })).toHaveText(
      "New circle family",
    );
    await visit(recipient.page, circleUrl);
    const ownRow = families(recipient.page)
      .getByRole("listitem")
      .filter({ hasText: "New circle family" });
    await expect(ownRow.getByText("Your family", { exact: true })).toBeVisible();
    await expect(
      families(recipient.page)
        .getByRole("listitem")
        .filter({ hasText: "Coordinating family" }),
    ).toContainText("Organizer");
  } finally {
    await Promise.all([owner.context.close(), recipient.context.close()]);
  }
});
