import * as UI from "@/ui/elements";
import Link from "@/ui/link";
import { AuthForm } from "../auth-form";

export default function ResendConfirmation() {
  return (
    <>
      <UI.Heading1>Resend confirmation email</UI.Heading1>
      <AuthForm mode="resend" />
      <UI.Nav aria-label="Account help">
        <Link href="/sign-in">Back to sign in</Link>
        <Link href="/forgot-password">Reset your password</Link>
      </UI.Nav>
    </>
  );
}
