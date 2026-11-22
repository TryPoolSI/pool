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
export async function expectToast(page, message) {
  // A toast confirms a finished action for four seconds, then leaves.
  await expect(page.getByTestId("toast").getByRole("status")).toHaveText(
    message,
  );
}

export async function family(page, name, display) {
  // An account without a family lands on the welcome form, already open.
  await page.goto("/app/profile");
  await expect(
    page.getByRole("heading", { level: 1, name: "Welcome to Pool" }),
  ).toBeVisible();
  await page.getByLabel("Your name", { exact: true }).fill(display);
  await page.getByLabel("Family name", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Create family", exact: true })
    .click();
  await expectToast(page, "Family created");
  await expect(page).toHaveURL(/\/app\/families\/[a-f0-9-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  return page.url();
}

const seatLabels = {
  standard: "Standard",
  booster: "Booster",
  "child-seat": "Child seat",
};
// Chooses a seat in the "Seat" radiogroup by its stored value or its label.
export async function chooseSeat(scope, seat) {
  const radio = scope
    .getByRole("radiogroup", { name: "Seat", exact: true })
    .getByRole("radio", { name: seatLabels[seat] ?? seat, exact: true });
  await radio.click();
  await expect(radio).toBeChecked();
}

// The form inside the "Add a child" sheet. Opens the sheet when it is closed.
export function childAddDialog(page) {
  return page.getByRole("dialog", { name: "Add a child", exact: true });
}
export function childAddForm(page) {
  return childAddDialog(page)
    .getByRole("form")
    .filter({
      has: page.getByRole("button", { name: "Add child", exact: true }),
    });
}

export async function addChild(page, name, seat = "booster") {
  await openAction(page, "Add a child");
  const form = childAddForm(page);
  await form.getByLabel("Name", { exact: true }).fill(name);
  await chooseSeat(form, seat);
  await form.getByRole("button", { name: "Add child", exact: true }).click();
  await expectToast(page, `${name} added`);
  await expect(childAddDialog(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

// Leaves the invitation sheet open on the created link, so a journey can also
// use "Copy invitation link". Navigating away or closeAction() dismisses it.
export async function invitation(page, email, kind) {
  const title = kind === "guardian" ? "Invite a guardian" : "Invite a family";
  const dialog = await openAction(page, title);
  const another = dialog.getByRole("button", {
    name: "Invite someone else",
    exact: true,
  });
  if (await another.isVisible()) await another.click();
  await dialog.getByLabel("Their email", { exact: true }).fill(email);
  await dialog
    .getByRole("button", { name: "Create invitation", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toHaveText(
    `Send this link yourself. Only ${email.toLowerCase()} can use it, and it works for 7 days.`,
  );
  const field = dialog.getByLabel("Invitation link", { exact: true });
  await expect(field).toBeVisible();
  const link = await field.inputValue();
  // Capability is copyable, but is never placed in an HTTP query/path.
  const url = new URL(link, "http://localhost:3100");
  expect(url.search).toBe("");
  expect(url.hash.startsWith(`#kind=${kind}&token=`)).toBe(true);
  return link;
}

export const invitationHeading = (page) =>
  page.getByRole("heading", { name: /^Join (family|circle): / });
export const joinButton = (page) =>
  page.getByRole("button", { name: /^Join /, exact: false });

// Opens an invitation link. A complete link is checked as soon as it arrives:
// the journey continues once Pool shows the invitation or says why it cannot.
export async function openAndCheck(page, link) {
  await page.goto(link);
  await expect(
    page.getByText("Checking your invitation…", { exact: true }),
  ).toHaveCount(0);
  await expect(
    invitationHeading(page).or(page.getByRole("alert")).first(),
  ).toBeVisible();
  // Opening a link only shows the invitation. Joining takes the adult's own
  // press on "Join <name>", so the page is still the invitation screen.
  await expect(page).toHaveURL(/\/app\/invitations(#.*)?$/);
  // FIXME(lead): for a signed-in adult the capability stays in the address
  // bar. src/app/_layout.tsx calls consumeFragment(), and Expo Router writes
  // the fragment straight back (two history.replaceState calls in the same
  // tick). Once that is fixed, assert it here:
  //   expect(new URL(page.url()).hash).toBe("");
  // The signed-out redirect does drop it (see confirmation.spec.mjs).
}

// Fills what the invitation asks for and joins. `name` is the family or circle
// on the invitation; pass `display` when the account has no name yet, and
// `familyName` when a circle invitation also creates the adult's family.
export async function joinInvitation(page, name, { display, familyName } = {}) {
  await expect(
    page.getByRole("heading", { name: new RegExp(`^Join (family|circle): `) }),
  ).toContainText(name);
  if (display !== undefined)
    await page.getByLabel("Your name", { exact: true }).fill(display);
  if (familyName !== undefined)
    await page.getByLabel("Family name", { exact: true }).fill(familyName);
  await page.getByRole("button", { name: `Join ${name}`, exact: true }).click();
}

// Journeys use visible disclosure and dialog controls. No DOM state shortcuts.
// `trigger` is the button's name when it differs from the sheet's title, as in
// list rows ("Edit" opens "Edit Ari"), or a locator for one row's button.
export async function openAction(page, title, trigger = title) {
  const dialog = page.getByRole("dialog", { name: title, exact: true });
  if (!(await dialog.isVisible()))
    await (
      typeof trigger === "string"
        ? page.getByRole("button", { name: trigger, exact: true })
        : trigger
    ).click();
  await expect(dialog).toBeVisible();
  return dialog;
}
// Sheets close themselves after a successful save, so this only presses
// "Close <title>" when the sheet is still open, then waits for it to leave.
export async function closeAction(page, title) {
  const dialog = page.getByRole("dialog", { name: title, exact: true });
  if (await dialog.isVisible())
    await dialog
      .getByRole("button", { name: `Close ${title}`, exact: true })
      .click();
  await expect(dialog).toHaveCount(0);
}

export async function expandDetails(page) {
  await page.getByRole("heading", { level: 1 }).waitFor();
  await expect(page.getByText("Loading…", { exact: true })).toHaveCount(0);
  // Shared disclosures expose their state through accessible button semantics.
  let closed = page.locator(
    '#main-content [data-testid="disclosure-toggle"][aria-expanded="false"]',
  );
  const count = await closed.count();
  for (let i = 0; i < count; i++) {
    const button = closed.first();
    if (await button.count()) await button.click();
  }
}
export async function visit(page, url) {
  const response = await page.goto(url);
  await expandDetails(page);
  return response;
}
// Data refreshes by itself every 20 seconds; a reload is the immediate way.
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
