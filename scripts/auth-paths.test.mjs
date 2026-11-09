import assert from "node:assert/strict";
import test from "node:test";
import {
  appReturnPath,
  emailLinkType,
  validTokenHash,
} from "../src/lib/auth/paths.ts";
import { verifiedUser } from "../src/lib/auth/identity.ts";

test("return paths stay inside /app after decoding and normalization", () => {
  for (const input of [
    undefined,
    null,
    ["/app"],
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/app/../../evil",
    "/app/%2e%2e/evil",
    "/app/%252e%252e/evil",
    "/application",
    "/app\n//evil",
    "/app/%0d%0aLocation:evil",
    "/app/%255c/evil",
    "/app/%",
    "/app#fragment",
    "/reset-password",
  ]) {
    assert.equal(appReturnPath(input), "/app", String(input));
  }
  assert.equal(appReturnPath("/app?tab=one"), "/app?tab=one");
  assert.equal(appReturnPath("/app/settings?tab=one"), "/app/settings?tab=one");
  assert.equal(emailLinkType("invite"), null);
  assert.equal(emailLinkType("recovery"), "recovery");
  assert.equal(validTokenHash("a".repeat(64)), true);
  assert.equal(validTokenHash("pkce_" + "a".repeat(56)), true);
  assert.equal(validTokenHash("a&next=//evil.example"), false);
});

test("identity comes from getUser, requiring confirmed non-anonymous email", async () => {
  const user = {
    id: "verified-id",
    email: "one@example.test",
    email_confirmed_at: "2026-10-26",
    is_anonymous: false,
  };
  for (const [data, error, expected] of [
    [{ user }, null, user],
    [{ user }, { message: "forged JWT" }, null],
    [{ user: null }, null, null],
    [{ user: { ...user, email_confirmed_at: null } }, null, null],
    [{ user: { ...user, is_anonymous: true } }, null, null],
    [{ user: { ...user, email: "" } }, null, null],
  ]) {
    let calls = 0;
    const client = {
      auth: {
        getUser: async () => {
          calls++;
          return { data, error };
        },
        getSession: () => assert.fail("Never authorize from a cookie session"),
      },
    };
    assert.equal(await verifiedUser(client), expected);
    assert.equal(calls, 1);
  }
});
