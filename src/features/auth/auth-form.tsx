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
import { INVITATIONS_PATH, INVITATION_SIGN_IN } from "@/lib/auth/paths";

function signupMessage(next?: string) {
  const [intro, signInLabel, conjunction, resetLabel, punctuation] =
    signupConfirmationCopy;
  return (
    <>
      {intro}
      <Link href={next === INVITATIONS_PATH ? INVITATION_SIGN_IN : "/sign-in"}>
        {signInLabel}
      </Link>
      {conjunction}
      <Link href="/forgot-password">{resetLabel}</Link>
      {punctuation}
    </>
  );
}

export function AuthForm({
  mode,
  next,
  resumeInvitation,
}: {
  mode:
    | "sign-in"
    | "sign-up"
    | "resend"
    | "recovery"
    | "reset"
    | "sign-out"
    | "switch-account";
  next?: string;
  resumeInvitation?: boolean;
}) {
  const actions = {
    "sign-in": signIn,
    "sign-up": signUp,
    resend: resendConfirmation,
    recovery: requestRecovery,
    reset: resetPassword,
    "sign-out": () => signOut(),
    "switch-account": () => signOut(true),
  };
  const labels = {
    "sign-in": "Sign in",
    "sign-up": "Create account",
    resend: "Resend confirmation email",
    recovery: "Send reset link",
    reset: "Save new password",
    "sign-out": "Sign out",
    "switch-account": "Use a different account",
  };
  return (
    <CommandForm
      action={(values) => actions[mode]({}, new Fields(values))}
      fields={{ next, resume_invitation: resumeInvitation ? "yes" : undefined }}
      label={labels[mode]}
      resetOnSuccess={mode === "sign-up"}
      renderMessage={mode === "sign-up" ? () => signupMessage(next) : undefined}
    >
      {mode !== "reset" && mode !== "sign-out" && mode !== "switch-account" && (
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
