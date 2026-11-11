import { test, expect } from "@playwright/test";
import {
  account,
  authMail,
  family,
  fillSignup,
  invitation,
  password,
  session,
  submitSignIn,
  submitSignup,
} from "./helpers.mjs";

const signupMessage =
  "Check your email for a confirmation link. If you already have an account, sign in or reset your password.";
const resendMessage =
  "If this address still needs confirmation, check your inbox and spam folder for the latest link. If it doesn’t arrive, wait a few minutes before trying again.";
const confirmationMessage = "Email confirmed. Sign in to continue.";
const newEmail = () => `pool-confirm-${crypto.randomUUID()}@example.test`;
const resendLink = (page) =>
  page.getByRole("link", { name: "Resend confirmation email" });
const confirmButton = (page) =>
  page.getByRole("button", { name: "Confirm email", exact: true });

async function expectSignupDraft(page, email, value, checked) {
  await expect(page.getByLabel("Email address")).toHaveValue(email);
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue(value);
  if (checked) await expect(page.getByRole("checkbox")).toBeChecked();
  else await expect(page.getByRole("checkbox")).not.toBeChecked();
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
  await submitSignup(page);
  await expect(page.getByRole("alert")).toHaveText(
    "Use a password between 12 and 128 characters.",
  );
  await expectSignupDraft(page, email, "short", true);

  await page.route("**/auth/v1/signup", (route) =>
    route.fulfill({
      status: 500,
      json: { code: "unexpected_failure", message: "internal mail error" },
    }),
  );
  await fillSignup(page, email);
  await submitSignup(page);
  await expect(page.getByRole("alert")).toContainText("Unable to create your account");
  await expectSignupDraft(page, email, password, true);
  await page.unroute("**/auth/v1/signup");

  await submitSignup(page);
  const status = page.getByRole("status");
  await expect(status).toHaveText(signupMessage);
  await expect(status.getByRole("link", { name: "sign in", exact: true })).toHaveAttribute(
    "href",
    "/sign-in",
  );
  await expect(status.getByRole("link", { name: "reset your password" })).toHaveAttribute(
    "href",
    "/forgot-password",
  );
  await expectSignupDraft(page, "", "", false);
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
    await expect(page.getByRole("status")).toHaveText(signupMessage);
    await expectSignupDraft(page, "", "", false);
    expect(await session(page)).toBeNull();

    const pending = newEmail();
    await fillSignup(page, pending);
    await submitSignup(page);
    await expect(page.getByRole("status")).toHaveText(signupMessage);
    const original = await authMail(pending, "signup");
    // The disposable stack has a one-second email cooldown.
    await page.waitForTimeout(1100);
    await fillSignup(page, pending);
    await submitSignup(page);
    await expect(page.getByRole("status")).toHaveText(signupMessage);
    await authMail(pending, "signup", original.id);
    await expectSignupDraft(page, "", "", false);

    await page.route("**/auth/v1/signup", (route) =>
      route.fulfill({
        status: 429,
        json: { code: "over_email_send_rate_limit", message: "provider detail" },
      }),
    );
    await fillSignup(page, pending);
    await submitSignup(page);
    await expect(page.getByRole("alert")).toContainText("Wait a few minutes");
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
    await resendLink(page).click();
    await expect(page).toHaveURL(/resend-confirmation$/);
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
      await expect(page.getByRole("status")).toHaveText(signupMessage);
      const original = await authMail(email, "signup");
      await resendLink(page).click();
      // Wait for the disposable stack's email cooldown before requesting mail.
      await page.waitForTimeout(1100);
      await requestResend(page, email);
      await expect(page.getByRole("status")).toHaveText(resendMessage);
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
      await expect(receiver).toHaveURL(/\/app$/);
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
    await expect(page.getByRole("status")).toHaveText(signupMessage);

    const receiver = await newBrowser.newPage();
    const { link } = await authMail(email, "signup");
    await receiver.goto(link);
    await confirmButton(receiver).click();
    await expect(receiver.getByRole("status")).toHaveText(confirmationMessage);
    await expect(receiver.getByText(/reopen the original invitation/)).toBeVisible();

    await page.getByRole("status").getByRole("link", { name: "sign in" }).click();
    await submitSignIn(page, email);
    await expect(page).toHaveURL(/\/app\/invitations$/);
    await expect(page.getByLabel("Invitation link")).toHaveValue(invite);
    await expect(page.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);

    await submitSignIn(receiver, email);
    await expect(receiver).toHaveURL(/\/app$/);
    await receiver.goto(invite);
    await expect(receiver.getByLabel("Invitation link")).toHaveValue(invite);
    await expect(receiver.getByRole("button", { name: "Accept invitation" })).toHaveCount(0);
    await receiver.getByRole("button", { name: "Check invitation" }).click();
    await expect(
      receiver.getByRole("heading", { name: "Join family: Signup invitation family" }),
    ).toBeVisible();
    await receiver.getByLabel("Your display name").fill("New guardian");
    await receiver.getByRole("checkbox").check();
    await receiver.getByRole("button", { name: "Accept invitation" }).click();
    await expect(receiver.getByRole("status")).toHaveText(/Membership accepted/);
  } finally {
    await newBrowser.close();
    await owner.context.close();
  }
});
