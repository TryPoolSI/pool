import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { INVITATIONS_PATH, INVITATION_SIGN_IN } from "@/lib/auth/paths";
import { signupConfirmationCopy } from "@/services/auth";
import * as UI from "@/ui/elements";
import Link from "@/ui/link";
import { AuthForm, ResendConfirmation } from "../auth-form";

// Shown in place of the form once the account is requested: where to look,
// and what to do if nothing arrives.
function CheckInbox({
  email,
  signInPath,
  onBack,
}: {
  email: string;
  signInPath: string;
  onBack: () => void;
}) {
  const message = `Check your email at ${email} for a confirmation link.`;
  const [, signInLabel, conjunction, resetLabel, punctuation] =
    signupConfirmationCopy;
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
  return (
    <>
      <UI.Heading1>Check your inbox</UI.Heading1>
      <UI.Paragraph role="status">{message}</UI.Paragraph>
      <UI.Paragraph>
        Open the link to finish, then sign in. If you already have an account,{" "}
        <Link href={signInPath}>{signInLabel}</Link>
        {conjunction}
        <Link href="/forgot-password">{resetLabel}</Link>
        {punctuation}
      </UI.Paragraph>
      <ResendConfirmation email={email} />
      <UI.Nav aria-label="Account help">
        <UI.Button
          className="quiet"
          style={{ paddingHorizontal: 0 }}
          onPress={onBack}
        >
          Use a different email
        </UI.Button>
      </UI.Nav>
    </>
  );
}

export default function SignUp() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const joining = next === INVITATIONS_PATH;
  const signInPath = joining ? INVITATION_SIGN_IN : "/sign-in";
  const [sentTo, setSentTo] = useState("");
  if (sentTo)
    return (
      <CheckInbox
        email={sentTo}
        signInPath={signInPath}
        onBack={() => setSentTo("")}
      />
    );
  return (
    <>
      <UI.Heading1>Create your Pool account</UI.Heading1>
      <UI.Paragraph>For adults who share the driving.</UI.Paragraph>
      <AuthForm
        mode="sign-up"
        next={joining ? INVITATIONS_PATH : undefined}
        onConfirmationSent={setSentTo}
      />
      <UI.Nav aria-label="Account help">
        <Link href={signInPath}>Already have an account? Sign in</Link>
      </UI.Nav>
    </>
  );
}
