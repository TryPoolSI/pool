import { expect } from "@playwright/test";

export const password = "Pool-membership-browser-2026!";
export async function account(browser, label) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = `pool-r3-${label}-${crypto.randomUUID()}@example.test`;
  await page.goto("/sign-up");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("I am at least 18 years old.").check();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  let link;
  await expect
    .poll(async () => {
      const { messages } = await fetch(
        "http://localhost:55324/api/v1/messages?limit=100",
      ).then((r) => r.json());
      const mail = messages.find((m) =>
        m.To.some((to) => to.Address === email),
      );
      if (!mail) return false;
      const message = await fetch(
        `http://localhost:55324/api/v1/message/${mail.ID}`,
      ).then((r) => r.json());
      link = message.HTML.match(/href="([^"]+)"/)?.[1].replaceAll("&amp;", "&");
      return Boolean(link);
    })
    .toBe(true);
  await page.goto(link);
  await page
    .getByRole("button", { name: "Confirm email", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app$/);
  return { context, page, email };
}
export async function family(page, name, display) {
  await page.goto("/app");
  await expandDetails(page);
  if (
    await page
      .getByRole("button", { name: "Create a family", exact: true })
      .count()
  )
    await openAction(page, "Create a family");
  await page.getByLabel("Family name", { exact: true }).fill(name);
  await page.getByLabel("Your display name").fill(display);
  await page
    .getByRole("button", { name: "Create family", exact: true })
    .click();
  await page.getByRole("link", { name: "Open saved membership" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  return page.url();
}
export async function invitation(page, email, kind) {
  await expandDetails(page);
  await openAction(
    page,
    kind === "guardian" ? "Invite a guardian" : "Invite another family",
  );
  await page.getByLabel("Recipient email").fill(email);
  await page
    .getByRole("button", { name: `Create ${kind} invitation`, exact: true })
    .click();
  await expect(page.getByLabel("Manual invitation link")).toBeVisible();
  const link = await page.getByLabel("Manual invitation link").inputValue();
  // Capability is copyable, but is never placed in an HTTP query/path.
  const url = new URL(link, "http://localhost:3100");
  expect(url.search).toBe("");
  expect(url.hash.startsWith(`#kind=${kind}&token=`)).toBe(true);
  return link;
}
export async function openAndCheck(page, link) {
  await page.goto(link);
  await expect
    .poll(
      async () =>
        (await page
          .getByLabel("Invitation link", { exact: true })
          .inputValue()) === link,
    )
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Accept invitation", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Check invitation", exact: true })
    .click();
}

// Journeys use visible disclosure and dialog controls. No DOM state shortcuts.
export async function openAction(page, title) {
  const dialog = page.getByRole("dialog", { name: title, exact: true });
  if (!(await dialog.isVisible()))
    await page.getByRole("button", { name: title, exact: true }).click();
  await expect(dialog).toBeVisible();
  return dialog;
}
export async function closeAction(page, title) {
  await page
    .getByRole("dialog", { name: title, exact: true })
    .getByRole("button", { name: "Done", exact: true })
    .click();
}

export async function expandDetails(page) {
  await page.getByRole("heading", { level: 1 }).waitFor();
  await expect(page.getByText("Loading details…", { exact: true })).toHaveCount(
    0,
  );
  // Shared disclosures expose their state through accessible button semantics.
  let closed = page.locator(
    '#main-content [data-testid="disclosure-toggle"][aria-expanded="false"]',
  );
  const count = await closed.count();
  for (let i = 0; i < count; i++) {
    const button = closed.first();
    if (await button.count()) await button.click();
  }
  // Account access is an explicit dialog on both web and native.
}
export async function visit(page, url) {
  const response = await page.goto(url);
  await expandDetails(page);
  return response;
}
export async function refresh(page) {
  const response = await page.reload();
  await expandDetails(page);
  return response;
}
