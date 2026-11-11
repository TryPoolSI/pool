import { Fields } from "../src/services/fields.ts";
import assert from "node:assert/strict";
import test, { after, beforeEach, mock } from "node:test";
import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { registerAuthTestLoader } from "./auth-test-loader.mjs";

const loader = registerAuthTestLoader();
const auth = {};
const emailAuth = {};
let invitation = null;
const identity = {
  id: "one",
  email: "one@example.test",
  email_confirmed_at: "yes",
};
mock.module(new URL("../src/lib/supabase/client.ts", import.meta.url).href, {
  exports: {
    createClient: () => ({ auth }),
    createEmailActionClient: () => ({ auth: emailAuth }),
  },
});
mock.module(new URL("../src/lib/supabase/storage.ts", import.meta.url).href, {
  exports: { storage: { getItem: async () => invitation } },
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
  invitation = null;
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
  emailAuth.resend = mock.fn(async () => ({ error: null }));
  emailAuth.verifyOtp = mock.fn(async () => ({
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

test("password sign-in resumes a saved invitation only without an explicit return path", async () => {
  const credentials = {
    email: identity.email,
    password: "valid-password",
  };
  invitation = `https://pool.example/app/invitations#kind=guardian&token=${"a".repeat(64)}`;
  await assert.rejects(
    actions.signIn({}, form(credentials)),
    /^Error: redirect:\/app\/invitations$/,
  );
  await assert.rejects(
    actions.signIn({}, form({ ...credentials, next: "/app/attention" })),
    /^Error: redirect:\/app\/attention$/,
  );
  invitation = "invalid";
  await assert.rejects(
    actions.signIn({}, form(credentials)),
    /^Error: redirect:\/app$/,
  );
});

test("signup masks duplicate accounts and gives actionable cooldown feedback", async () => {
  const data = form({
    email: identity.email,
    password: "valid-password",
    adult: "yes",
  });
  const accepted = await actions.signUp({}, data);
  for (const code of ["user_already_exists", "email_exists"]) {
    auth.signUp.mock.mockImplementation(async () => ({ error: { code } }));
    assert.deepEqual(await actions.signUp({}, data), accepted);
  }
  auth.signUp.mock.mockImplementation(async () => ({
    error: { code: "over_email_send_rate_limit", message: "provider detail" },
  }));
  assert.match((await actions.signUp({}, data)).error, /Wait.*confirmation email/);
});

test("resend validates email and gives the same response for account-specific provider results", async () => {
  assert.deepEqual(
    await actions.resendConfirmation({}, form({ email: "bad email" })),
    { error: "Enter a valid email address." },
  );
  assert.equal(emailAuth.resend.mock.callCount(), 0);
  const data = form({ email: " One@Example.test " });
  const accepted = await actions.resendConfirmation({}, data);
  assert.match(accepted.message, /If this address still needs confirmation/);
  assert.deepEqual(emailAuth.resend.mock.calls[0].arguments, [
    { email: "one@example.test", type: "signup" },
  ]);
  for (const code of ["user_not_found", "over_email_send_rate_limit", "unexpected_failure"]) {
    emailAuth.resend.mock.mockImplementation(async () => ({ error: { code } }));
    assert.deepEqual(await actions.resendConfirmation({}, data), accepted);
  }
  emailAuth.resend.mock.mockImplementation(async () => ({
    error: new AuthRetryableFetchError("private provider detail", 0),
  }));
  assert.deepEqual(await actions.resendConfirmation({}, data), {
    error: "Check your connection and try again.",
  });
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

test("signup verification stays isolated and sends a confirmed user to sign in", async () => {
  const tokenHash = "a".repeat(64);
  const data = form({ token_hash: tokenHash, type: "signup", next: "/app/rides" });
  await assert.rejects(
    actions.confirmEmail(form({ type: "signup", token_hash: "invalid" })),
    /redirect:\/auth\/error\?type=signup/,
  );
  assert.equal(emailAuth.verifyOtp.mock.callCount(), 0);
  await assert.rejects(actions.confirmEmail(data), /redirect:\/sign-in\?message=email-confirmed$/);
  assert.deepEqual(emailAuth.verifyOtp.mock.calls[0].arguments, [
    { token_hash: tokenHash, type: "signup" },
  ]);
  assert.equal(auth.verifyOtp.mock.callCount(), 0);
  assert.equal(auth.getUser.mock.callCount(), 0);
  assert.equal(auth.signOut.mock.callCount(), 0);
  emailAuth.verifyOtp.mock.mockImplementation(async () => ({
    error: { code: "otp_expired" },
  }));
  await assert.rejects(actions.confirmEmail(data), /redirect:\/auth\/error\?type=signup/);
  emailAuth.verifyOtp.mock.mockImplementation(async () => ({
    error: { status: 429 },
  }));
  assert.match((await actions.confirmEmail(data)).error, /Wait.*try again/);
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
