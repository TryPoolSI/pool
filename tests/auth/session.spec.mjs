import { Buffer } from "node:buffer";
import { test, expect } from "@playwright/test";
import { account, password } from "./helpers.mjs";
async function signIn(page, email, next = "/app", value = password) {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(value);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
async function signOut(page) {
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/signed-out/);
}
async function session(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("pool-auth-v2")));
}
async function replaceSession(page, value) {
  await page.evaluate(
    (value) =>
      localStorage.setItem(
        "pool-auth-v2",
        typeof value === "string" ? value : JSON.stringify(value),
      ),
    value,
  );
}
async function mail(email, type = "recovery") {
  let link;
  await expect
    .poll(async () => {
      const { messages } = await fetch(
        "http://localhost:55324/api/v1/messages?limit=100",
      ).then((r) => r.json());
      const delivered = messages.find(
        (m) =>
          m.To.some((to) => to.Address === email) &&
          m.Subject ===
            (type === "recovery"
              ? "Reset your Pool password"
              : "Confirm your Pool email"),
      );
      if (!delivered) return false;
      const message = await fetch(
        `http://localhost:55324/api/v1/message/${delivered.ID}`,
      ).then((r) => r.json());
      link = message.HTML.match(/href="([^"]+)"/)?.[1].replaceAll("&amp;", "&");
      return Boolean(link);
    })
    .toBe(true);
  return link;
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
      one.page.getByRole("heading", { name: "Welcome to Pool" }),
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
      two.page.getByRole("heading", { name: "Welcome to Pool" }),
    ).toBeVisible();
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
test("recovery changes the password, signs out sessions and rejects reused links", async ({
  browser,
}) => {
  const person = await account(browser, "recovery");
  const page = person.page;
  try {
    await signOut(page);
    await page.goto("/forgot-password");
    await page.getByLabel("Email address").fill(person.email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText(
      "If an account matches",
    );
    const link = await mail(person.email);
    await page.goto(link);
    await page.getByRole("button", { name: "Choose a new password" }).click();
    await expect(page).toHaveURL(/reset-password$/);
    await page
      .getByLabel("New password", { exact: true })
      .fill("Replacement-pool-password!");
    await page
      .getByLabel("Confirm new password")
      .fill("Replacement-pool-password!");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page).toHaveURL(/password-updated/);
    expect(await session(page)).toBeNull();
    await signIn(page, person.email);
    await expect(page.getByRole("alert")).toContainText("Unable to sign in");
    await signIn(page, person.email, "/app", "Replacement-pool-password!");
    await expect(page).toHaveURL(/\/app$/);
    await page.goto(link);
    await page.getByRole("button", { name: "Choose a new password" }).click();
    await expect(page).toHaveURL(/auth\/error$/);
  } finally {
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
    await expect(page).toHaveURL(/auth\/error$/);
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
    await expect(page).toHaveURL("http://localhost:3100/app");
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

test("an actually expired signed token with an invalid refresh token cannot retain protected access", async ({
  browser,
}) => {
  const person = await account(browser, "signed-expiry");
  try {
    const saved = await session(person.page);
    const claims = JSON.parse(
      Buffer.from(saved.access_token.split(".")[1], "base64url").toString(),
    );
    await person.page.waitForTimeout(
      Math.max(0, claims.exp * 1000 - Date.now() + 1500),
    );
    await replaceSession(person.page, {
      ...saved,
      refresh_token: "expired-invalid-refresh",
    });
    await person.page.reload();
    await expect(person.page).toHaveURL(/sign-in/);
    await expect(
      person.page.getByRole("heading", { name: "Welcome to Pool" }),
    ).toHaveCount(0);
  } finally {
    await person.context.close();
  }
});
