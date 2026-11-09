import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import Link from "@/ui/link";
import { AuthForm } from "../auth-form";
import { appReturnPath } from "@/lib/auth/paths";

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
    <AuthForm mode="sign-in" next={appReturnPath(params.next)} />
    <UI.Nav aria-label="Account help">
      <Link href="/forgot-password">Forgot password?</Link>
      <Link href="/sign-up">Create an adult account</Link>
    </UI.Nav>
  </>
));
export default SignIn;
