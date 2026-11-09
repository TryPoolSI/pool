import * as UI from "@/ui/elements";
import Link from "@/ui/link";

export default function AuthError() {
  return (
    <>
      <UI.Heading1>This link could not be used</UI.Heading1>
      <UI.Paragraph>
        The link may be invalid, expired, already used, or opened in a different
        browser. Please request a new link and try again.
      </UI.Paragraph>
      <UI.Nav aria-label="Try again">
        <Link href="/forgot-password">Request a new password reset link</Link>
        <Link href="/sign-up">Request a confirmation by signing up again</Link>
        <Link href="/sign-in">Back to sign in</Link>
      </UI.Nav>
    </>
  );
}
