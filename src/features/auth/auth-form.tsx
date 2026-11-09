import * as UI from "@/ui/elements";
import { CommandForm, Fields } from "@/ui/command-form";
import {
  signIn,
  signUp,
  requestRecovery,
  resetPassword,
  signOut,
} from "@/services/auth";
export function AuthForm({
  mode,
  next = "/app",
}: {
  mode: "sign-in" | "sign-up" | "recovery" | "reset" | "sign-out";
  next?: string;
}) {
  const actions = {
    "sign-in": signIn,
    "sign-up": signUp,
    recovery: requestRecovery,
    reset: resetPassword,
    "sign-out": signOut,
  };
  const labels = {
    "sign-in": "Sign in",
    "sign-up": "Create account",
    recovery: "Send reset link",
    reset: "Save new password",
    "sign-out": "Sign out",
  };
  return (
    <CommandForm
      action={(values) => actions[mode]({}, new Fields(values))}
      fields={{ next }}
      label={labels[mode]}
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
