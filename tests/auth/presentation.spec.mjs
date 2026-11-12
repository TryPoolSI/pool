import { test, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { account, addChild, family, openAction } from "./helpers.mjs";
import { captureState } from "./presentation.mjs";
async function accessible(page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
async function checkHomeLogo(page, navigation) {
  const home = navigation.getByRole("link", { name: "Home", exact: true });
  const logo = page.getByRole("link", { name: "Pool home", exact: true });
  for (const [label, path] of [
    ["Today", "/app/attention"],
    ["Schedule", "/app/schedule"],
  ]) {
    await navigation.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(home).not.toHaveAttribute("aria-current", "page");
    await expect(logo).toHaveAttribute("href", "/app");
    await logo.click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(home).toHaveAttribute("aria-current", "page");
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }
}

test("R8 shared layouts retain desktop composition, mobile navigation, keyboard dialogs and saved outcomes", async ({
  browser,
}) => {
  const person = await account(browser, "expo-presentation"),
    page = person.page;
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("navigation", { name: "Phone navigation" }),
    ).toBeVisible();
    await accessible(page);
    expect(
      await page
        .getByRole("heading", { level: 1 })
        .evaluate((n) => getComputedStyle(n).fontFamily),
    ).toContain("Manrope");
    const menu = page.getByRole("button", { name: "Menu", exact: true });
    await menu.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Your Pool", exact: true });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Close Your Pool", exact: true }),
    ).toBeFocused();
    for (let cycle = 0; cycle < 5; cycle++) {
      await page.keyboard.press("Shift+Tab");
      await expect(
        dialog.getByRole("button", { name: "Done", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(
        dialog.getByRole("button", { name: "Close Your Pool", exact: true }),
      ).toBeFocused();
    }
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(menu).toBeFocused();
    await menu.click();
    await dialog.getByRole("link", { name: "Schedule", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/schedule$/);
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("group", { name: "Full week" })).toBeVisible();
    await expect(page.getByTestId("week-day")).toHaveCount(7);
    await accessible(page);
    await captureState(page, "schedule");
    await page.setViewportSize({ width: 320, height: 844 });
    const phoneNav = page.getByRole("navigation", { name: "Phone navigation" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/profile");
    await page.getByRole("button", { name: "Create a family", exact: true }).click();
    await page.getByLabel("Family name", { exact: true }).fill(" ");
    await page.getByLabel("Your name", { exact: true }).fill("Presentation guardian");
    await page.getByRole("button", { name: "Create family", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await accessible(page);
    const familyUrl = await family(page, "Presentation family", "Presentation guardian");
    await expect(
      phoneNav.getByRole("link", { name: "Home", exact: true }),
    ).not.toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
    await accessible(page);
    await captureState(page, "family");
    await checkHomeLogo(page, phoneNav);
    await menu.click();
    await expect(dialog.getByRole("link", { name: "Children", exact: true })).toHaveCount(0);
    await dialog.getByRole("link", { name: "My family", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Presentation family");
    const createCircle = page.getByRole("button", {
      name: "Create a circle",
      exact: true,
    });
    await openAction(page, "Create a circle");
    await accessible(page);
    await expect(
      page.getByRole("button", { name: "Close Create a circle", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(createCircle).toBeFocused();
    await openAction(page, "Create a circle");
    await page.getByLabel("Circle name").fill("Presentation circle");
    await page
      .getByRole("button", { name: "Create circle", exact: true })
      .click();
    await page.getByRole("link", { name: "Open saved membership" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
    await accessible(page);
    await captureState(page, "circle");
    await page.goto(familyUrl);
    await addChild(page, "Presentation child");
    await page.goto("/app/rides/new");
    await accessible(page);
    await captureState(page, "planning");
    for (const path of [
      familyUrl,
      "/app/invitations",
      "/app/profile",
      "/app/vehicles",
      "/app/driving",
      "/app/attention",
    ]) {
      await page.goto(path);
      await page.getByRole("heading", { level: 1 }).waitFor();
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await accessible(page);
      }
    }
    await page.goto("/app/schedule?date=invalid&timezone=UTC");
    await expect(page.getByRole("alert")).toContainText("Choose a valid date");
    await accessible(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/app");
    await page.getByRole("link", { name: "Skip to main content" }).waitFor();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to main content" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
    await expect(
      page.getByRole("navigation", { name: "Application" }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Phone navigation" }),
    ).toHaveCount(0);
    const sidebar = page.getByRole("navigation", {
      name: "Application",
      exact: true,
    });
    const newTab = page.context().waitForEvent("page");
    await sidebar
      .getByRole("link", { name: "Schedule", exact: true })
      .click({ modifiers: ["ControlOrMeta"] });
    const scheduleTab = await newTab;
    await expect(scheduleTab).toHaveURL(/\/app\/schedule$/);
    await expect(scheduleTab.getByRole("heading", { level: 1 })).toHaveText(
      "Schedule",
    );
    await scheduleTab.close();
    await expect(page).toHaveURL(/\/app$/);
    await sidebar.getByRole("link", { name: "Schedule", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/schedule$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
    await page.goBack();
    await expect(page).toHaveURL(/\/app$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/app\/schedule$/);
    await checkHomeLogo(page, sidebar);
    await sidebar.getByRole("link", { name: "Home", exact: true }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("link", { name: /Presentation family/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Create (a )?family$/ })).toHaveCount(0);
    await accessible(page);
    await page.emulateMedia({ colorScheme: "dark" });
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).colorScheme,
      ),
    ).toBe("light");
    await accessible(page);
    for (const path of [
      "/sign-in",
      "/sign-up",
      "/forgot-password",
      "/reset-password",
    ]) {
      await page.goto(path);
      await page.getByRole("heading", { level: 1 }).waitFor();
      await accessible(page);
    }
    await page.goto("/sign-in");
    await captureState(page, "authentication");
  } finally {
    await person.context.close();
  }
});
