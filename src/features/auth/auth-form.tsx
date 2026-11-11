import * as UI from "@/ui/elements";
import { CommandForm, Fields } from "@/ui/command-form";
import {
  signIn,
  signUp,
  signupConfirmationCopy,
  resendConfirmation,
  requestRecovery,
  resetPassword,
  signOut,
} from "@/services/auth";
import Link from "@/ui/link";

function signupMessage() {
  const [intro, signInLabel, conjunction, resetLabel, punctuation] =
    signupConfirmationCopy;
  return (
    <>
      {intro}
      <Link href="/sign-in">{signInLabel}</Link>
      {conjunction}
      <Link href="/forgot-password">{resetLabel}</Link>
      {punctuation}
    </>
  );
}

export function AuthForm({
  mode,
  next,
}: {
  mode: "sign-in" | "sign-up" | "resend" | "recovery" | "reset" | "sign-out";
  next?: string;
}) {
  const actions = {
    "sign-in": signIn,
    "sign-up": signUp,
    resend: resendConfirmation,
    recovery: requestRecovery,
    reset: resetPassword,
    "sign-out": signOut,
  };
  const labels = {
    "sign-in": "Sign in",
    "sign-up": "Create account",
    resend: "Resend confirmation email",
    recovery: "Send reset link",
    reset: "Save new password",
    "sign-out": "Sign out",
  };
  return (
    <CommandForm
      action={(values) => actions[mode]({}, new Fields(values))}
      fields={{ next }}
      label={labels[mode]}
      resetOnSuccess={mode === "sign-up"}
      renderMessage={mode === "sign-up" ? signupMessage : undefined}
    >
      {mode !== "reset" && mode !== "sign-out" && (
        <UI.Label>
          Email address
          <UI.Field
            type="email"
            name="email"
            autoComplete="email"
            maxLength={254}
            required
          />
        </UI.Label>
      )}
      {(mode === "sign-in" || mode === "sign-up" || mode === "reset") && (
        <UI.Label>
          {mode === "reset" ? "New password" : "Password"}
          <UI.Field
            type="password"
            name="password"
            autoComplete={
              mode === "sign-in" ? "current-password" : "new-password"
            }
            maxLength={128}
            required
          />
        </UI.Label>
      )}
      {mode === "reset" && (
        <UI.Label>
          Confirm new password
          <UI.Field
            type="password"
            name="confirmation"
            autoComplete="new-password"
            maxLength={128}
            required
          />
        </UI.Label>
      )}
      {mode === "sign-up" && (
        <>
          <UI.Paragraph>Use 12–128 characters for your password.</UI.Paragraph>
          <UI.Label className="checkbox-label">
            <UI.Field type="checkbox" name="adult" value="yes" required />I am
            at least 18 years old.
          </UI.Label>
        </>
      )}
    </CommandForm>
  );
}
