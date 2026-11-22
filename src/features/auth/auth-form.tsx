import { useRef, useState } from "react";
import * as UI from "@/ui/elements";
import { CommandForm, Fields } from "@/ui/command-form";
import { spacing, styles } from "@/ui/styles";
import {
  type AuthState,
  signIn,
  signUp,
  resendConfirmation,
  requestRecovery,
  resetPassword,
  signOut,
} from "@/services/auth";

// The address typed at sign-up, kept in memory only, so the next auth screen
// in the same visit does not ask for it again.
let recentEmail = "";

// Offered only where a confirmation email is known to be outstanding: after
// sign-up, and when sign-in fails because the address is not confirmed yet.
// It sends to the address already given, so nothing is typed again.
export function ResendConfirmation({ email }: { email: string }) {
  const [state, setState] = useState<AuthState>({});
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  async function send() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      setState(await resendConfirmation({}, new Fields({ email })));
    } catch {
      setState({ error: "Check your connection and try again." });
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <>
      <UI.Box
        style={[
          styles.row,
          { flexWrap: "wrap", columnGap: spacing.sm, rowGap: 0 },
        ]}
      >
        <UI.Paragraph>Didn’t receive the email?</UI.Paragraph>
        <UI.Button
          className="quiet"
          style={{ paddingHorizontal: 0 }}
          busy={pending}
          disabled={pending}
          onPress={send}
        >
          Send it again
        </UI.Button>
      </UI.Box>
      {!pending && state.error && (
        <UI.Paragraph role="alert">{state.error}</UI.Paragraph>
      )}
      {!pending && state.message && (
        <UI.Paragraph role="status">{state.message}</UI.Paragraph>
      )}
    </>
  );
}

export function AuthForm({
  mode,
  next,
  resumeInvitation,
  onConfirmationSent,
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
  // Sign-up hands over to a "check your inbox" screen instead of clearing the
  // form and leaving a message under it.
  onConfirmationSent?: (email: string) => void;
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
  const newPassword = mode === "sign-up" || mode === "reset";
  // The address a sign-in was refused for because it is not confirmed yet.
  const [unconfirmed, setUnconfirmed] = useState("");
  return (
    <>
      <CommandForm
        action={async (values) => {
          const email = String(values.email ?? "")
            .trim()
            .toLowerCase();
          const result: AuthState | undefined = await actions[mode](
            {},
            new Fields(values),
          ).catch((leaving: unknown) => {
            // Signing in ends by leaving this screen; the address is done with.
            if (mode === "sign-in") recentEmail = "";
            throw leaving;
          });
          if (mode === "sign-in")
            setUnconfirmed(result?.unconfirmed ? email : "");
          if (mode === "sign-up" && result && !result.error) {
            recentEmail = email;
            if (onConfirmationSent) return onConfirmationSent(email);
          }
          return result;
        }}
        fields={{
          next,
          resume_invitation: resumeInvitation ? "yes" : undefined,
        }}
        label={labels[mode]}
        secondary={mode === "sign-out" || mode === "switch-account"}
        after="inline"
      >
        {mode !== "reset" &&
          mode !== "sign-out" &&
          mode !== "switch-account" && (
            <UI.Label>
              Email address
              <UI.Field
                type="email"
                name="email"
                autoComplete="email"
                maxLength={254}
                defaultValue={
                  mode === "sign-in" || mode === "resend" ? recentEmail : ""
                }
                required
              />
            </UI.Label>
          )}
        {(mode === "sign-in" || newPassword) && (
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
            {newPassword ? (
              <UI.Inline style={styles.hint}>At least 12 characters.</UI.Inline>
            ) : null}
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
          <UI.Label className="checkbox-label">
            <UI.Field type="checkbox" name="adult" value="yes" required />I am
            at least 18 years old.
          </UI.Label>
        )}
      </CommandForm>
      {unconfirmed ? (
        <ResendConfirmation key={unconfirmed} email={unconfirmed} />
      ) : null}
    </>
  );
}
