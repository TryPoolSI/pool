import * as UI from "@/ui/elements";
import Link from "@/ui/link";
import { AuthForm } from "../auth-form";

export default function SignUp() {
  return (
    <>
      <UI.Heading1>Create your Pool account</UI.Heading1>
      <UI.Paragraph>For adults coordinating family rides.</UI.Paragraph>
      <AuthForm mode="sign-up" />
      <UI.Nav aria-label="Account help">
        <Link href="/sign-in">Already have an account? Sign in</Link>
        <Link href="/resend-confirmation">Resend confirmation email</Link>
      </UI.Nav>
    </>
  );
}
