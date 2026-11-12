import { useEffect } from "react";
import { AccessibilityInfo } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as UI from "@/ui/elements";
import Link from "@/ui/link";
import { useSession } from "@/services/session";
import { SessionProblem } from "@/ui/session-problem";
import { AuthForm } from "../auth-form";
import {
  appReturnPath,
  INVITATIONS_PATH,
  INVITATION_SIGN_UP,
} from "@/lib/auth/paths";
import { PasteInvitation } from "./paste-invitation";

function EmailConfirmed() {
  const message = "Email confirmed. Sign in to continue.";
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
  return (
    <>
      <UI.Paragraph role="status">{message}</UI.Paragraph>
      <UI.Paragraph>
        Joining a family on a different browser or device? Sign in with the
        invited email, then reopen the original invitation.
      </UI.Paragraph>
    </>
  );
}

export default function SignIn() {
  const params = useLocalSearchParams<{ next?: string; message?: string }>();
  const { error } = useSession();
  const next =
    params.next === undefined ? undefined : appReturnPath(params.next);
  const joining = next === INVITATIONS_PATH;
  if (error) return <SessionProblem />;
  return (
    <>
      <UI.Heading1>Sign in to Pool</UI.Heading1>
      {params.message === "signed-out" && (
        <UI.Paragraph role="status">You are signed out.</UI.Paragraph>
      )}
      {params.message === "password-updated" && (
        <UI.Paragraph role="status">
          Your password has been updated. Sign in with your new password.
        </UI.Paragraph>
      )}
      {params.message === "email-confirmed" && <EmailConfirmed />}
      {joining && (
        <UI.Paragraph>
          Sign in with the email address on your invitation.
        </UI.Paragraph>
      )}
      <AuthForm
        mode="sign-in"
        next={next}
        resumeInvitation={params.message === "email-confirmed"}
      />
      <PasteInvitation />
      <UI.Nav aria-label="Account help">
        <Link href="/forgot-password">Forgot password?</Link>
        <Link href="/resend-confirmation">Resend confirmation email</Link>
        <Link href={joining ? INVITATION_SIGN_UP : "/sign-up"}>
          Create an adult account
        </Link>
      </UI.Nav>
    </>
  );
}
