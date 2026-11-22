import { test, expect } from "@playwright/test";
import {
  account,
  authMail,
  expectToast,
  family,
  fillSignup,
  invitation,
  joinInvitation,
  password,
  session,
  submitSignIn,
  submitSignup,
} from "./helpers.mjs";

// The same words for a new, a pending and an already confirmed address.
const signupMessage = (email) =>
  `Check your email at ${email} for a confirmation link.`;
const resendMessage =
  "If this address still needs confirmation, check your inbox and spam folder for the latest link. If it doesn’t arrive, wait a few minutes before trying again.";
const confirmationMessage = "Email confirmed. Sign in to continue.";
const newEmail = () => `pool-confirm-${crypto.randomUUID()}@example.test`;
// The resend page is linked only from the "link could not be used" screen.
const resendLink = (page) =>
  page.getByRole("link", { name: "Resend confirmation email" });
// Sending again in place: after sign-up, and after a sign-in that was refused
// because the address is not confirmed yet.
const resendPrompt = (page) => page.getByText("Didn’t receive the email?");
const sendAgain = (page) =>
  page.getByRole("button", { name: "Send it again", exact: true });
async function expectNoResend(page) {
  await expect(resendLink(page)).toHaveCount(0);
  await expect(resendPrompt(page)).toHaveCount(0);
  await expect(sendAgain(page)).toHaveCount(0);
}
const confirmButton = (page) =>
  page.getByRole("button", { name: "Confirm email", exact: true });

async function expectSignupDraft(page, email, value, checked) {
  await expect(page.getByLabel("Email address")).toHaveValue(email);
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue(value);
  if (checked) await expect(page.getByRole("checkbox")).toBeChecked();
  else await expect(page.getByRole("checkbox")).not.toBeChecked();
}

// After sign-up the form is replaced by "Check your inbox": the password is no
// longer on screen, and no session exists until the email is confirmed.
async function expectCheckInbox(page, email, signInPath = "/sign-in") {
  await expect(
    page.getByRole("heading", { level: 1, name: "Check your inbox" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(signupMessage(email));
  await expect(
    page.getByRole("link", { name: "sign in", exact: true }),
  ).toHaveAttribute("href", signInPath);
  await expect(
    page.getByRole("link", { name: "reset your password", exact: true }),
  ).toHaveAttribute("href", "/forgot-password");
  await expect(page.getByLabel("Email address")).toHaveCount(0);
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  expect(await session(page)).toBeNull();
}

// "Use a different email" returns to a blank form: nothing typed is kept.
async function useDifferentEmail(page) {
  await page
    .getByRole("button", { name: "Use a different email", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Create your Pool account" }),
  ).toBeVisible();
  await expectSignupDraft(page, "", "", false);
}

async function requestResend(page, email) {
  await expect(
    page.getByRole("heading", { name: "Resend confirmation email" }),
  ).toBeVisible();
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Resend confirmation email" }).click();
}

test("signup preserves failed drafts, then clears all fields and shows real account links", async ({
  page,
}) => {
  const email = newEmail();
  await page.goto("/sign-up");
  await fillSignup(page, email, "short");
  // Nothing has been sent yet, so there is nothing to send again.
  await expectNoResend(page);
  await submitSignup(page);
  await expect(page.getByRole("alert")).toHaveText(
    "Use a password with at least 12 characters.",
  );
  await expectSignupDraft(page, email, "short", true);
  await expectNoResend(page);

  await page.route("**/auth/v1/signup", (route) =>
    route.fulfill({
      status: 500,
      json: { code: "unexpected_failure", message: "internal mail error" },
    }),
  );
  await fillSignup(page, email);
  await submitSignup(page);
  await expect(page.getByRole("alert")).toContainText(
    "Pool couldn’t create your account just now.",
  );
  await expectSignupDraft(page, email, password, true);
  await page.unroute("**/auth/v1/signup");

  await submitSignup(page);
  await expectCheckInbox(page, email);
  await expect(resendPrompt(page)).toBeVisible();
  await expect(sendAgain(page)).toBeEnabled();
  await expect(resendLink(page)).toHaveCount(0);
  await useDifferentEmail(page);
  await expectNoResend(page);
  expect(await session(page)).toBeNull();
});

test("duplicate signup keeps the neutral success copy and a throttled request preserves the draft", async ({
  browser,
  page,
}) => {
  const confirmed = await account(browser, "confirmed-duplicate");
  try {
    await page.goto("/sign-up");
    await fillSignup(page, confirmed.email);
    await submitSignup(page);
    await expectCheckInbox(page, confirmed.email);
    await useDifferentEmail(page);

    const pending = newEmail();
    await fillSignup(page, pending);
    await submitSignup(page);
    await expectCheckInbox(page, pending);
    const original = await authMail(pending, "signup");
    // The disposable stack has a one-second email cooldown.
    await page.waitForTimeout(1100);
    await useDifferentEmail(page);
    await fillSignup(page, pending);
    await submitSignup(page);
    await expectCheckInbox(page, pending);
    await authMail(pending, "signup", original.id);
    await useDifferentEmail(page);

    await page.route("**/auth/v1/signup", (route) =>
      route.fulfill({
        status: 429,
        json: { code: "over_email_send_rate_limit", message: "provider detail" },
      }),
    );
    await fillSignup(page, pending);
    await submitSignup(page);
    await expect(page.getByRole("alert")).toHaveText(
      "That’s too many tries. Wait a few minutes, then try again.",
    );
    await expectSignupDraft(page, pending, password, true);
  } finally {
    await confirmed.context.close();
  }
});

test("resend has neutral responses for unknown, confirmed, and throttled addresses", async ({
  browser,
  page,
}) => {
  const confirmed = await account(browser, "resend-confirmed");
  try {
    await page.goto("/sign-in");
    await expect(
      page.getByRole("heading", { name: "Sign in to Pool" }),
    ).toBeVisible();
    await expectNoResend(page);
    await page.goto("/resend-confirmation");
    await requestResend(page, newEmail());
    await expect(page.getByRole("status")).toHaveText(resendMessage);
    await requestResend(page, confirmed.email);
    await expect(page.getByRole("status")).toHaveText(resendMessage);

    await page.route("**/auth/v1/resend", (route) =>
      route.fulfill({
        status: 429,
        json: { code: "over_email_send_rate_limit", message: "provider detail" },
      }),
    );
    await requestResend(page, confirmed.email);
    await expect(page.getByRole("status")).toHaveText(resendMessage);
    await page.unroute("**/auth/v1/resend");

    await page.route("**/auth/v1/resend", (route) => route.abort("failed"));
    await requestResend(page, confirmed.email);
    await expect(page.getByRole("alert")).toHaveText(
      "Check your connection and try again.",
    );
    await expect(page.getByLabel("Email address")).toHaveValue(confirmed.email);
  } finally {
    await confirmed.context.close();
  }
});

for (const signedIn of [false, true]) {
  test(`a resent link confirms across browsers ${signedIn ? "with another account signed in" : "while signed out"}`, async ({
    browser,
    page,
  }) => {
    const other = signedIn ? await account(browser, "other-confirmation") : null;
    const recipient = other?.context ?? (await browser.newContext());
    const email = newEmail();
    try {
      await page.goto("/sign-up");
      await fillSignup(page, email);
      await submitSignup(page);
      await expectCheckInbox(page, email);
      const original = await authMail(email, "signup");
      // Wait for the disposable stack's email cooldown before requesting mail.
      await page.waitForTimeout(1100);
      // The address typed at sign-up is not asked for again.
      await sendAgain(page).click();
      await expect(page.getByText(resendMessage)).toBeVisible();
      await expect(page).toHaveURL(/\/sign-up$/);
      await expect(page.getByLabel("Email address")).toHaveCount(0);
      const { link } = await authMail(email, "signup", original.id);
      const url = new URL(link);
      expect(url.origin).toBe(new URL(page.url()).origin);
      expect(url.pathname).toBe("/auth/confirm");
      expect(url.searchParams.get("type")).toBe("signup");
      expect(url.searchParams.get("token_hash")).toBeTruthy();
      expect(link).not.toBe(original.link);

      const receiver = other?.page ?? (await recipient.newPage());
      const originalUserId = other ? (await session(receiver)).user.id : null;
      expect((await recipient.request.get(link)).ok()).toBe(true);
      const verifyRequests = [];
      receiver.on("request", (request) => {
        if (new URL(request.url()).pathname.endsWith("/auth/v1/verify"))
          verifyRequests.push(request.method());
      });
      await receiver.goto(link);
      await expect(confirmButton(receiver)).toBeVisible();
      expect((await session(receiver))?.user.id ?? null).toBe(originalUserId);
      expect(verifyRequests).toEqual([]);
      await confirmButton(receiver).click();
      await expect(receiver).toHaveURL(/\/sign-in\?message=email-confirmed$/);
      await expect(receiver.getByRole("status")).toHaveText(confirmationMessage);
      expect(verifyRequests).toEqual(["POST"]);
      expect((await session(receiver))?.user.id ?? null).toBe(originalUserId);

      await submitSignIn(receiver, email);
      await expect(receiver).toHaveURL(/\/app\/profile$/);
      expect((await session(receiver)).user.email).toBe(email);

      await receiver.goto(link);
      await confirmButton(receiver).click();
      await expect(receiver).toHaveURL(/\/auth\/error\?type=signup$/);
      await expect(
        receiver.getByRole("link", { name: "Back to sign in" }),
      ).toHaveAttribute("href", "/sign-in");
      await resendLink(receiver).click();
      await expect(receiver).toHaveURL(/resend-confirmation$/);
    } finally {
      await recipient.close();
    }
  });
}

test("sign-in offers to send the email again only when the address is not confirmed", async ({
  page,
}) => {
  const email = newEmail();
  await page.goto("/sign-up");
  await fillSignup(page, email);
  await submitSignup(page);
  await expectCheckInbox(page, email);
  const original = await authMail(email, "signup");

  await page.goto("/sign-in");
  await expect(
    page.getByRole("heading", { name: "Sign in to Pool" }),
  ).toBeVisible();
  await expectNoResend(page);
  // A wrong password is an ordinary failure: nothing to send again.
  await submitSignIn(page, email, `${password}-wrong`);
  await expect(page.getByRole("alert")).toContainText(
    "That email and password didn’t work.",
  );
  await expectNoResend(page);

  await submitSignIn(page, email);
  await expect(page.getByRole("alert")).toHaveText(
    "Confirm your email first. Open the link Pool sent you, then sign in.",
  );
  await expect(resendPrompt(page)).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveValue(email);
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue(
    password,
  );
  // Wait for the disposable stack's email cooldown before requesting mail.
  await page.waitForTimeout(1100);
  await sendAgain(page).click();
  await expect(page.getByText(resendMessage)).toBeVisible();
  const { link } = await authMail(email, "signup", original.id);
  expect(link).not.toBe(original.link);

  await page.route("**/auth/v1/resend", (route) => route.abort("failed"));
  await sendAgain(page).click();
  await expect(
    page.getByText("Check your connection and try again.", { exact: true }),
  ).toBeVisible();
  await page.unroute("**/auth/v1/resend");

  // The next ordinary failure takes the offer away again.
  await submitSignIn(page, email, `${password}-wrong`);
  await expect(page.getByRole("alert")).toContainText(
    "That email and password didn’t work.",
  );
  await expectNoResend(page);
  expect(await session(page)).toBeNull();
});

test("an invited adult can continue in the original browser or reopen the invitation elsewhere", async ({
  browser,
  page,
}) => {
  const owner = await account(browser, "invitation-confirmation-owner");
  const newBrowser = await browser.newContext();
  const email = newEmail();
  try {
    await family(owner.page, "Signup invitation family", "Pool owner");
    const invite = await invitation(owner.page, email, "guardian");
    await page.goto(invite);
    await expect(page).toHaveURL(/\/sign-in\?next=/);
    expect(new URL(page.url()).hash).toBe("");
    await page.getByRole("link", { name: "Create an adult account" }).click();
    await fillSignup(page, email);
    await submitSignup(page);
    await expectCheckInbox(page, email, "/sign-in?next=/app/invitations");

    const receiver = await newBrowser.newPage();
    const { link } = await authMail(email, "signup");
    await receiver.goto(link);
    await confirmButton(receiver).click();
    await expect(receiver.getByRole("status")).toHaveText(confirmationMessage);
    await expect(receiver.getByText(/reopen the original invitation/)).toBeVisible();

    await page.getByRole("link", { name: "sign in", exact: true }).click();
    await submitSignIn(page, email);
    await expect(page).toHaveURL(/\/app\/invitations$/);
    // The remembered invitation is shown again, and waits for the adult's
    // own decision: the page stays here until "Join" is pressed.
    const joinFamily = (target) =>
      target.getByRole("button", {
        name: "Join Signup invitation family",
        exact: true,
      });
    await expect(
      page.getByRole("heading", { name: "Join family: Signup invitation family" }),
    ).toBeVisible();
    await expect(joinFamily(page)).toBeEnabled();
    await expect(page).toHaveURL(/\/app\/invitations$/);

    await submitSignIn(receiver, email);
    await expect(receiver).toHaveURL(/\/app\/profile$/);
    await receiver.goto(invite);
    await expect(
      receiver.getByRole("heading", { name: "Join family: Signup invitation family" }),
    ).toBeVisible();
    await expect(receiver).toHaveURL(/\/app\/invitations/);
    await joinInvitation(receiver, "Signup invitation family", {
      display: "New guardian",
    });
    await expectToast(receiver, "You joined Signup invitation family");
    await expect(receiver.getByRole("heading", { level: 1 })).toHaveText("Signup invitation family");
  } finally {
    await newBrowser.close();
    await owner.context.close();
  }
});
