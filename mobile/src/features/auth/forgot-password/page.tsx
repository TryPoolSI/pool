import * as UI from "@/ui/elements";
import Link from "@/ui/link";
import { AuthForm } from "../auth-form";

export default function Recovery() {
  return (
    <>
      <UI.Heading1>Reset your password</UI.Heading1>
      <UI.Paragraph>
        We will email you a link to choose a new password.
      </UI.Paragraph>
      <AuthForm mode="recovery" />
      <Link href="/sign-in">Back to sign in</Link>
    </>
  );
}
