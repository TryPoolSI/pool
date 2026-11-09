import { Fields } from "../src/services/fields.ts";
import assert from "node:assert/strict";
import test, { after, beforeEach, mock } from "node:test";
import { registerAuthTestLoader } from "./auth-test-loader.mjs";

const loader = registerAuthTestLoader();
const auth = {};
const identity = {
  id: "one",
  email: "one@example.test",
  email_confirmed_at: "yes",
};
mock.module(new URL("../src/lib/supabase/client.ts", import.meta.url).href, {
  exports: { createClient: async () => ({ auth }) },
});
mock.module(new URL("../src/lib/navigation.ts", import.meta.url).href, {
  exports: {
    redirect: (target) => {
      throw new Error(`redirect:${target}`);
    },
  },
});
const actions = await import("../src/services/auth.ts");
loader.deregister();
after(() => mock.restoreAll());
beforeEach(() => {
  for (const key of [
    "signUp",
    "signInWithPassword",
    "resetPasswordForEmail",
    "updateUser",
    "signOut",
    "verifyOtp",
    "exchangeCodeForSession",
  ])
    auth[key] = mock.fn(async () => ({ data: {}, error: null }));
  auth.getUser = mock.fn(async () => ({
    data: { user: identity },
    error: null,
  }));
});
function form(fields) {
  const data = new Fields();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

test("sign-in rejects provider errors/unconfirmed identities and validates the destination", async () => {
  const data = form({
    email: "One@Example.test ",
    password: "valid-password",
    next: "//evil.example",
  });
  auth.signInWithPassword.mock.mockImplementation(async () => ({
    error: { message: "provider secret" },
  }));
  assert.match((await actions.signIn({}, data)).error, /Unable to sign in/);
  auth.signInWithPassword.mock.mockImplementation(async () => ({
    error: null,
  }));
  auth.getUser.mock.mockImplementation(async () => ({
    data: { user: { ...identity, email_confirmed_at: null } },
    error: null,
  }));
  assert.match((await actions.signIn({}, data)).error, /Confirm your email/);
  auth.getUser.mock.mockImplementation(async () => ({
    data: { user: identity },
    error: null,
  }));
  await assert.rejects(actions.signIn({}, data), /^Error: redirect:\/app$/);
  assert.equal(
    auth.signInWithPassword.mock.calls.at(-1).arguments[0].email,
    "one@example.test",
  );
});

test("signup validates adult attestation/password server-side and mail never trusts redirect headers", async () => {
  const fields = { email: "one@example.test", password: "valid-password" };
  assert.match((await actions.signUp({}, form(fields))).error, /at least 18/);
  assert.equal(auth.signUp.mock.callCount(), 0);
  assert.match(
    (
      await actions.signUp(
        {},
        form({ ...fields, adult: "yes", password: "short" }),
      )
    ).error,
    /12 and 128/,
  );
  const state = await actions.signUp(
    {},
    form({ ...fields, adult: "yes", next: "https://evil.example" }),
  );
  assert.match(state.message, /Check your email/);
  assert.deepEqual(auth.signUp.mock.calls[0].arguments, [fields]);
});

test("recovery/reset failures are useful, do not expose provider details, and require verified identity", async () => {
  const data = form({ email: "one@example.test" });
  assert.match(
    (await actions.requestRecovery({}, data)).message,
    /If an account matches/,
  );
  auth.resetPasswordForEmail.mock.mockImplementation(async () => ({
    error: { message: "private provider detail" },
  }));
  assert.match(
    (await actions.requestRecovery({}, data)).error,
    /try again shortly/,
  );
  const passwords = form({
    password: "new-password-123",
    confirmation: "new-password-123",
  });
  auth.getUser.mock.mockImplementation(async () => ({
    data: { user: null },
    error: null,
  }));
  await assert.rejects(
    actions.resetPassword({}, passwords),
    /redirect:\/auth\/error/,
  );
  assert.equal(auth.updateUser.mock.callCount(), 0);
  auth.getUser.mock.mockImplementation(async () => ({
    data: { user: identity },
    error: null,
  }));
  auth.updateUser.mock.mockImplementation(async () => ({
    error: { message: "weak or reused" },
  }));
  assert.match(
    (await actions.resetPassword({}, passwords)).error,
    /Choose a different password/,
  );
  auth.updateUser.mock.mockImplementation(async () => ({ error: null }));
  await assert.rejects(
    actions.resetPassword({}, passwords),
    /redirect:\/sign-in\?message=password-updated/,
  );
  assert.deepEqual(auth.signOut.mock.calls[0].arguments, [{ scope: "global" }]);
});

test("confirmation accepts only valid signup/recovery hashes and rejects expired/used links", async () => {
  await assert.rejects(
    actions.confirmEmail(form({ type: "invite", token_hash: "a".repeat(64) })),
    /redirect:\/auth\/error/,
  );
  assert.equal(auth.verifyOtp.mock.callCount(), 0);
  auth.verifyOtp.mock.mockImplementation(async () => ({
    error: { message: "expired" },
  }));
  await assert.rejects(
    actions.confirmEmail(
      form({ type: "recovery", token_hash: "a".repeat(64) }),
    ),
    /redirect:\/auth\/error/,
  );
  auth.verifyOtp.mock.mockImplementation(async () => ({ error: null }));
  await assert.rejects(
    actions.confirmEmail(
      form({ type: "recovery", token_hash: "a".repeat(64), next: "//evil" }),
    ),
    /redirect:\/reset-password/,
  );
});

test("callback rejects missing/provider/error codes and external return destinations", async () => {
  for (const input of [
    {},
    { code: "ignored", error: "denied" },
    { code: "expired" },
  ]) {
    auth.exchangeCodeForSession.mock.mockImplementation(async () => ({
      error: { message: "failed" },
    }));
    await assert.rejects(
      actions.exchangeAuthCode(input),
      /redirect:\/auth\/error/,
    );
  }
  auth.exchangeCodeForSession.mock.mockImplementation(async () => ({
    error: null,
  }));
  await assert.rejects(
    actions.exchangeAuthCode({ code: "valid", next: "//evil.example" }),
    /redirect:\/app$/,
  );
});

test("sign-out errors remain visible and regular sign-out ends only this session", async () => {
  auth.signOut.mock.mockImplementation(async () => ({
    error: { message: "offline" },
  }));
  assert.match((await actions.signOut()).error, /Unable to sign out/);
  auth.signOut.mock.mockImplementation(async () => ({ error: null }));
  await assert.rejects(
    actions.signOut(),
    /redirect:\/sign-in\?message=signed-out/,
  );
  assert.deepEqual(auth.signOut.mock.calls.at(-1).arguments, [
    { scope: "local" },
  ]);
});
