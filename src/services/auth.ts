import { isAuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";
import { Fields } from "./fields";
import { invitationParts, pendingInvitation } from "./invitation-link";
import { beginSessionEnd } from "./session-end";

import { redirect } from "@/lib/navigation";
import { createClient, createEmailActionClient } from "@/lib/supabase/client";
import { isConfirmedEmailUser, verifiedUser } from "@/lib/auth/identity";
import { appReturnPath, emailLinkType, validTokenHash, INVITATIONS_PATH, INVITATION_SIGN_IN } from "@/lib/auth/paths";

export type AuthState = {
  error?: string;
  message?: string;
  // Sign-in failed only because the address is not confirmed yet: the one
  // sign-in outcome that offers to send the confirmation email again.
  unconfirmed?: boolean;
};
const confirmFirst: AuthState = {
  error: "Confirm your email first. Open the link Pool sent you, then sign in.",
  unconfirmed: true,
};
export const signupConfirmationCopy = [
  "Check your email for a confirmation link. If you already have an account, ",
  "sign in",
  " or ",
  "reset your password",
  ".",
] as const;

const field = (data: Fields, name: string) => String(data.get(name) ?? "");
const emailAddress = (data: Fields) =>
  field(data, "email").trim().toLowerCase();
const validEmail = (email: string) =>
  email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validPassword = (password: string) =>
  password.length >= 12 && password.length <= 128;
const rateLimited = (error: AuthError) =>
  error.status === 429 ||
  error.code === "over_email_send_rate_limit" ||
  error.code === "over_request_rate_limit";

export async function signIn(_: AuthState, data: Fields): Promise<AuthState> {
  const email = emailAddress(data);
  const password = field(data, "password");
  if (!validEmail(email) || !password || password.length > 128)
    return { error: "Enter your email and password." };
  const client = await createClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  // A request that never arrived is not a wrong password.
  if (error && (isAuthRetryableFetchError(error) || rateLimited(error)))
    return {
      error: rateLimited(error)
        ? "That’s too many tries. Wait a few minutes, then try again."
        : "Pool couldn’t reach the server. Check your connection and try again.",
    };
  // Supabase reports this only after the password matched, so saying so does
  // not reveal whether an address has an account.
  if (error?.code === "email_not_confirmed") return confirmFirst;
  if (error)
    return {
      error:
        "That email and password didn’t work. Check them and try again. If you just signed up, confirm your email first.",
    };
  if (!(await verifiedUser(client))) return confirmFirst;
  const next = data.get("next");
  if (next === null && data.get("resume_invitation") === "yes") {
    const invitation = await pendingInvitation().catch(() => "");
    if (invitationParts(invitation)) redirect(INVITATIONS_PATH);
  }
  redirect(appReturnPath(next));
}

export async function signUp(_: AuthState, data: Fields): Promise<AuthState> {
  const email = emailAddress(data);
  const password = field(data, "password");
  if (!validEmail(email)) return { error: "Enter a valid email address." };
  if (!validPassword(password))
    return {
      error:
        password.length > 128
          ? "That password is too long. Keep it under 128 characters."
          : "Use a password with at least 12 characters.",
    };
  if (data.get("adult") !== "yes")
    return {
      error: "Pool accounts are for adults. Confirm that you are at least 18.",
    };
  const client = await createClient();
  // Mail templates use Supabase's configured Site URL, never a caller's Host,
  // Origin, forwarded header or user-provided absolute redirect URL.
  const { error } = await client.auth.signUp({ email, password });
  if (error && rateLimited(error))
    return {
      error:
        "That’s too many tries. Wait a few minutes, then try again.",
    };
  if (
    error &&
    error.code !== "user_already_exists" &&
    error.code !== "email_exists"
  )
    return {
      error:
        "Pool couldn’t create your account just now. Try again in a moment, or sign in if you already have one.",
    };
  return { message: signupConfirmationCopy.join("") };
}

export async function resendConfirmation(
  _: AuthState,
  data: Fields,
): Promise<AuthState> {
  const email = emailAddress(data);
  if (!validEmail(email)) return { error: "Enter a valid email address." };
  const { error } = await createEmailActionClient().auth.resend({
    type: "signup",
    email,
  });
  if (isAuthRetryableFetchError(error) && error.status === 0)
    return { error: "Check your connection and try again." };
  // Provider outcomes such as a per-address limit or delivery failure can
  // disclose whether an address has a pending confirmation.
  return {
    message:
      "If this address still needs confirmation, check your inbox and spam folder for the latest link. If it doesn’t arrive, wait a few minutes before trying again.",
  };
}

export async function requestRecovery(
  _: AuthState,
  data: Fields,
): Promise<AuthState> {
  const email = emailAddress(data);
  if (!validEmail(email)) return { error: "Enter a valid email address." };
  const client = await createClient();
  const { error } = await client.auth.resetPasswordForEmail(email);
  if (error)
    return {
      error:
        "Pool couldn’t send the reset email just now. Try again in a moment.",
    };
  return {
    message:
      "If an account matches that email, a password reset link is on its way. Check your inbox.",
  };
}

export async function resetPassword(
  _: AuthState,
  data: Fields,
): Promise<AuthState> {
  const password = field(data, "password");
  if (!validPassword(password))
    return {
      error:
        password.length > 128
          ? "That password is too long. Keep it under 128 characters."
          : "Use a password with at least 12 characters.",
    };
  if (password !== field(data, "confirmation"))
    return {
      error: "Those passwords don’t match. Type the same one in both fields.",
    };
  const client = await createClient();
  if (!(await verifiedUser(client))) redirect("/auth/error");
  const { error } = await client.auth.updateUser({ password });
  if (error)
    return {
      error:
        "Pool couldn’t save that password. Choose a different one, or ask for a new reset link.",
    };
  const finish = beginSessionEnd("password-updated");
  const { error: signOutError } = await client.auth
    .signOut({ scope: "global" })
    .finally(finish);
  if (signOutError)
    return {
      error:
        "Your password changed, but Pool couldn’t sign you out. Sign out again before you leave this device.",
    };
  redirect("/sign-in?message=password-updated");
}

export async function signOut(switchAccount = false): Promise<AuthState> {
  const client = await createClient();
  const finish = beginSessionEnd(switchAccount ? "switch-account" : "signed-out");
  const { error } = await client.auth
    .signOut({ scope: "local" })
    .finally(finish);
  if (error) return { error: "Pool couldn’t sign you out. Try again." };
  redirect(switchAccount ? INVITATION_SIGN_IN : "/sign-in?message=signed-out");
}

export async function confirmEmail(data: Fields): Promise<AuthState> {
  const tokenHash = data.get("token_hash");
  const type = emailLinkType(data.get("type"));
  if (type === "signup") {
    if (!validTokenHash(tokenHash)) redirect("/auth/error?type=signup");
    const { data, error } = await createEmailActionClient().auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (error && (rateLimited(error) || isAuthRetryableFetchError(error)))
      return {
        error:
          "Pool couldn’t confirm your email just now. Wait a moment and try again.",
      };
    if (error || !isConfirmedEmailUser(data.user))
      redirect("/auth/error?type=signup");
    redirect("/sign-in?message=email-confirmed");
  }
  if (!validTokenHash(tokenHash) || !type) redirect("/auth/error");
  const client = await createClient();
  const { error } = await client.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });
  if (error || !(await verifiedUser(client))) redirect("/auth/error");
  redirect("/reset-password");
}

export async function exchangeAuthCode(input: {
  code?: string;
  error?: string;
  next?: string;
}) {
  if (input.error || !input.code || input.code.length >= 2048)
    redirect("/auth/error");
  const client = await createClient();
  const { error } = await client.auth.exchangeCodeForSession(input.code);
  if (error || !(await verifiedUser(client))) redirect("/auth/error");
  redirect(appReturnPath(input.next));
}
