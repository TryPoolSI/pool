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
    await expect(other.page.getByRole("status")).toContainText(
      "Membership accepted",
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
    await guardian.page
      .getByRole("link", { name: "Open saved membership" })
      .click();
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
