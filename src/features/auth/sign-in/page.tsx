import { useEffect } from "react";
import { AccessibilityInfo } from "react-native";
import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import Link from "@/ui/link";
import { AuthForm } from "../auth-form";
import { appReturnPath } from "@/lib/auth/paths";

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

async function loadSignIn({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; message?: string }>;
}) {
  const params = await searchParams;
  return { model: { params } };
}

const SignIn = createScreen(loadSignIn, ({ params }) => (
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
    <AuthForm
      mode="sign-in"
      next={params.next === undefined ? undefined : appReturnPath(params.next)}
    />
    <UI.Nav aria-label="Account help">
      <Link href="/forgot-password">Forgot password?</Link>
      <Link href="/resend-confirmation">Resend confirmation email</Link>
      <Link href="/sign-up">Create an adult account</Link>
    </UI.Nav>
  </>
));
export default SignIn;
