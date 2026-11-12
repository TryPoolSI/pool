import { Buffer } from "node:buffer";
import { test, expect } from "@playwright/test";
import {
  account,
  family,
  authMail,
  password,
  session,
  replaceSession,
  submitSignIn,
} from "./helpers.mjs";
async function signIn(page, email, next = "/app", value = password) {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await submitSignIn(page, email, value);
}
async function signOut(page) {
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/signed-out/);
}
async function requestRecovery(page, email) {
  await page.goto("/forgot-password");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account matches");
  return mail(email);
}
async function expectRecoveryRetry(page) {
  await expect(page).toHaveURL(/auth\/error$/);
  await page
    .getByRole("link", { name: "Request a new password reset link" })
    .click();
  await expect(page).toHaveURL(/forgot-password$/);
  await expect(
    page.getByRole("button", { name: "Send reset link" }),
  ).toBeEnabled();
}
async function mail(email, type = "recovery") {
  return (await authMail(email, type)).link;
}
test("real signup, separate sessions, token rotation, safe return paths and local sign-out", async ({
  browser,
}) => {
  const one = await account(browser, "session-one"),
    two = await account(browser, "session-two");
  try {
    const stale = await session(one.page);
    await replaceSession(one.page, { ...stale, expires_at: 1 });
    await one.page.reload();
    await expect(
      one.page.getByRole("heading", { name: "Profile" }),
    ).toBeVisible();
    const renewed = await session(one.page);
    expect(renewed.expires_at).toBeGreaterThan(Date.now() / 1000);
    expect(renewed.refresh_token).not.toBe(stale.refresh_token);
    await one.page
      .getByRole("button", { name: "Account", exact: true })
      .click();
    await expect(one.page.getByText(one.email, { exact: true })).toBeVisible();
    await expect(one.page.getByText(two.email, { exact: true })).toHaveCount(0);
    await one.page.getByRole("button", { name: "Done", exact: true }).click();
    const shell = await one.context.request.get("/app");
    expect(shell.headers()["cache-control"]).toContain("no-store");
    expect(await shell.text()).not.toContain(one.email);
    await signOut(one.page);
    expect(await session(one.page)).toBeNull();
    await one.page.goto("/app");
    await expect(one.page).toHaveURL(/sign-in/);
    await two.page.reload();
    await expect(
      two.page.getByRole("heading", { name: "Profile" }),
    ).toBeVisible();
    await signIn(one.page, one.email);
    await expect(one.page).toHaveURL(/\/app\/profile$/);
    await family(one.page, "Session family", "Returning adult");
    await signOut(one.page);
    for (const next of [
      "https://evil.example",
      "//evil.example",
      "/app/%2e%2e/evil",
    ]) {
      await signIn(one.page, one.email, next);
      await expect(one.page).toHaveURL("http://localhost:3100/app");
      await signOut(one.page);
    }
    await signIn(one.page, one.email, "/app?tab=one");
    await expect(one.page).toHaveURL("http://localhost:3100/app?tab=one");
  } finally {
    await one.context.close();
    await two.context.close();
  }
});
for (const browserState of ["signed out", "signed in as another account"]) {
  test(`recovery works in a separate browser that is ${browserState}`, async ({
    browser,
  }) => {
    const person = await account(browser, "recovery");
    const other =
      browserState === "signed out"
        ? null
        : await account(browser, "other-account");
    const recipient = other?.context ?? (await browser.newContext());
    const page = other?.page ?? (await recipient.newPage());
    const newPassword = "Replacement-pool-password!";
    try {
      await signOut(person.page);
      const link = await requestRecovery(person.page, person.email);
      const url = new URL(link);
      expect(url.origin).toBe(new URL(person.page.url()).origin);
      expect(url.pathname).toBe("/auth/confirm");
      expect(url.searchParams.get("type")).toBe("recovery");
      expect(url.searchParams.get("token_hash")).toBeTruthy();

      // An inbox preview may fetch the landing page before the recipient acts.
      expect((await recipient.request.get(link)).ok()).toBe(true);
      await page.goto(link);
      const choosePassword = page.getByRole("button", {
        name: "Choose a new password",
      });
      await expect(choosePassword).toBeVisible();
      expect((await session(page))?.user.email ?? null).toBe(
        other?.email ?? null,
      );
      await choosePassword.click();
      await expect(page).toHaveURL(/reset-password$/);
      expect((await session(page))?.user.email).toBe(person.email);
      await page.getByLabel("New password", { exact: true }).fill(newPassword);
      await page.getByLabel("Confirm new password").fill(newPassword);
      await page.getByRole("button", { name: "Save new password" }).click();
      await expect(page).toHaveURL(/\/sign-in\?message=password-updated$/);
      await expect(page.getByRole("status")).toHaveText(
        "Your password has been updated. Sign in with your new password.",
      );
      expect(await session(page)).toBeNull();

      if (other) {
        await signIn(page, other.email);
        await expect(page).toHaveURL(/\/app\/profile$/);
        await signOut(page);
      }
      await signIn(page, person.email);
      await expect(page.getByRole("alert")).toContainText("Unable to sign in");
      await signIn(page, person.email, "/app", newPassword);
      await expect(page).toHaveURL(/\/app\/profile$/);

      await page.goto(link);
      await choosePassword.click();
      await expectRecoveryRetry(page);
    } finally {
      await recipient.close();
      await person.context.close();
    }
  });
}

test("expired recovery mail offers a direct way to request another link", async ({
  browser,
}) => {
  const person = await account(browser, "expired-recovery");
  const recipient = await browser.newContext();
  try {
    await signOut(person.page);
    const link = await requestRecovery(person.page, person.email);
    const page = await recipient.newPage();
    await page.goto(link);
    // The disposable browser harness sets the email OTP lifetime to 10 seconds.
    await page.waitForTimeout(12000);
    await page.getByRole("button", { name: "Choose a new password" }).click();
    await expectRecoveryRetry(page);
    expect(await session(page)).toBeNull();
  } finally {
    await recipient.close();
    await person.context.close();
  }
});
test("absent, malformed and forged persisted sessions fail closed", async ({
  browser,
}) => {
  const person = await account(browser, "forged"),
    page = person.page;
  try {
    const real = await session(page);
    await replaceSession(page, "malformed");
    await page.reload();
    await expect(page).toHaveURL(/sign-in/);
    const parts = real.access_token.split(".");
    parts[1] = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(parts[1], "base64url").toString()),
        sub: "00000000-0000-4000-8000-000000000000",
        email: "forged@example.test",
      }),
    ).toString("base64url");
    await replaceSession(page, {
      ...real,
      access_token: parts.join("."),
      refresh_token: "invalid",
      user: { ...real.user, email: "forged@example.test" },
    });
    await page.goto("/app");
    await expect(page).toHaveURL(/sign-in/);
    await expect(page.getByText("forged@example.test")).toHaveCount(0);
  } finally {
    await person.context.close();
  }
});
test("expired mail and malformed callbacks fail without consuming a link on GET", async ({
  browser,
}) => {
  const context = await browser.newContext(),
    page = await context.newPage();
  try {
    const email = `pool-expired-${crypto.randomUUID()}@example.test`;
    await page.goto("/sign-up");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("status")).toContainText("Check your email");
    const link = await mail(email, "signup");
    await context.request.get(link);
    await page.goto(link);
    await expect(
      page.getByRole("button", { name: "Confirm email", exact: true }),
    ).toBeVisible();
    await page.waitForTimeout(12000);
    await page
      .getByRole("button", { name: "Confirm email", exact: true })
      .click();
    await expect(page).toHaveURL(/auth\/error\?type=signup$/);
    await page.getByRole("link", { name: "Resend confirmation email" }).click();
    await expect(page).toHaveURL(/resend-confirmation$/);
    await expect(page.getByLabel("Email address")).toBeVisible();
    for (const path of [
      "/auth/callback",
      "/auth/callback?error=denied&error_description=untrusted-copy",
      "/auth/callback?code=invalid&next=//evil.example",
    ]) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: "This link could not be used" }),
      ).toBeVisible();
      await expect(page.getByText("untrusted-copy")).toHaveCount(0);
    }
  } finally {
    await context.close();
  }
});
test("PKCE callback requires original browser verifier and rejects code replay", async ({
  browser,
}) => {
  const context = await browser.newContext(),
    page = await context.newPage();
  try {
    const email = `pool-pkce-${crypto.randomUUID()}@example.test`;
    await page.goto("/sign-up");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("status")).toContainText("Check your email");
    const link = new URL(await mail(email, "signup"));
    const verify = new URL("http://localhost:55321/auth/v1/verify");
    verify.searchParams.set("token", link.searchParams.get("token_hash"));
    verify.searchParams.set("type", "signup");
    verify.searchParams.set(
      "redirect_to",
      "http://localhost:3100/auth/callback?next=//evil.example",
    );
    const response = await context.request.get(verify.href, {
      maxRedirects: 0,
    });
    const callback = response.headers().location;
    expect(callback).toContain("code=");
    const missing = await browser.newContext(),
      other = await missing.newPage();
    await other.goto(callback);
    await expect(other).toHaveURL(/auth\/error/);
    await missing.close();
    await page.goto(callback);
    await expect(page).toHaveURL("http://localhost:3100/app/profile");
    await page.goto(callback);
    await expect(page).toHaveURL(/auth\/error/);
  } finally {
    await context.close();
  }
});
test("keyboard signup and public shell/assets remain available at narrow widths", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/sign-up");
  await page.getByLabel("Email address").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("checkbox")).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const path of ["/", "/api/health", "/robots.txt"])
    expect((await context.request.get(path)).status()).toBe(200);
});
