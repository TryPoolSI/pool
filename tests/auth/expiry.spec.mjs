import { Buffer } from "node:buffer";
import { test, expect } from "@playwright/test";
import { account, session, replaceSession } from "./helpers.mjs";

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
