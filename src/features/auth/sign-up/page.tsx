import { useLocalSearchParams } from "expo-router";
import { INVITATIONS_PATH, INVITATION_SIGN_IN } from "@/lib/auth/paths";
import * as UI from "@/ui/elements";
import Link from "@/ui/link";
import { AuthForm } from "../auth-form";

export default function SignUp() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const joining = next === INVITATIONS_PATH;
  return (
    <>
      <UI.Heading1>Create your Pool account</UI.Heading1>
      <UI.Paragraph>For adults coordinating family rides.</UI.Paragraph>
      <AuthForm mode="sign-up" next={joining ? INVITATIONS_PATH : undefined} />
      <UI.Nav aria-label="Account help">
        <Link href={joining ? INVITATION_SIGN_IN : "/sign-in"}>
          Already have an account? Sign in
        </Link>
        <Link href="/resend-confirmation">Resend confirmation email</Link>
      </UI.Nav>
    </>
  );
}
