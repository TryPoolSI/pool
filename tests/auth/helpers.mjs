import { expect } from "@playwright/test";

export const password = "Pool-membership-browser-2026!";
export async function fillSignup(page, email, value = password) {
  await expect(
    page.getByRole("heading", { name: "Create your Pool account" }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(value);
  await page.getByLabel("I am at least 18 years old.").check();
}

export async function submitSignup(page) {
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
}

export async function submitSignIn(page, email, value = password) {
  await expect(
    page.getByRole("heading", { name: "Sign in to Pool" }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(value);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

export async function authMail(email, type, previousId) {
  const subject =
    type === "recovery" ? "Reset your Pool password" : "Confirm your Pool email";
  let captured;
  await expect
    .poll(async () => {
      const { messages } = await fetch(
        "http://localhost:55324/api/v1/messages?limit=100",
      ).then((r) => r.json());
      const mail = messages.find(
        (m) =>
          m.ID !== previousId &&
          m.Subject === subject &&
          m.To.some((to) => to.Address === email),
      );
      if (!mail) return false;
      const message = await fetch(
        `http://localhost:55324/api/v1/message/${mail.ID}`,
      ).then((r) => r.json());
      const link = message.HTML.match(/href="([^"]+)"/)?.[1].replaceAll(
        "&amp;",
        "&",
      );
      captured = { id: mail.ID, link };
      return Boolean(captured.link);
    })
    .toBe(true);
  return captured;
}

export async function account(browser, label) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = `pool-r3-${label}-${crypto.randomUUID()}@example.test`;
  await page.goto("/sign-up");
  await fillSignup(page, email);
  await submitSignup(page);
  await expect(page.getByRole("status")).toContainText("Check your email");
  const { link } = await authMail(email, "signup");
  await page.goto(link);
  await page
    .getByRole("button", { name: "Confirm email", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Email confirmed. Sign in to continue.",
  );
  await submitSignIn(page, email);
  await expect(page).toHaveURL(/\/app\/profile$/);
  return { context, page, email };
}
export async function family(page, name, display) {
  await page.goto("/app/profile");
  await page.getByRole("button", { name: "Create a family", exact: true }).click();
  await page.getByLabel("Family name", { exact: true }).fill(name);
  await page.getByLabel("Your name", { exact: true }).fill(display);
  await page
    .getByRole("button", { name: "Create family", exact: true })
    .click();
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

export async function session(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("pool-auth-v2")));
}
export async function replaceSession(page, value) {
  await page.evaluate(
    (value) =>
      localStorage.setItem(
        "pool-auth-v2",
        typeof value === "string" ? value : JSON.stringify(value),
      ),
    value,
  );
}
