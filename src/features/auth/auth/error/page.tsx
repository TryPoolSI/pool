import { useLocalSearchParams } from "expo-router";
import * as UI from "@/ui/elements";
import Link from "@/ui/link";

export default function AuthError() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  const signup = type === "signup";
  return (
    <>
      <UI.Heading1>This link could not be used</UI.Heading1>
      <UI.Paragraph>
        {signup
          ? "This confirmation link may be invalid, expired, or already used. Request another link, or sign in if you’ve already confirmed your email."
          : "The link may be invalid, expired, already used, or opened in a different browser. Please request a new link and try again."}
      </UI.Paragraph>
      <UI.Nav aria-label="Try again">
        {!signup && (
          <Link href="/forgot-password">Request a new password reset link</Link>
        )}
        <Link href="/resend-confirmation">Resend confirmation email</Link>
        <Link href="/sign-in">Back to sign in</Link>
      </UI.Nav>
    </>
  );
}
