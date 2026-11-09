import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import { redirect } from "@/lib/navigation";
import Link from "@/ui/link";
import { createClient } from "@/lib/supabase/client";
import { verifiedUser } from "@/lib/auth/identity";
import { AuthForm } from "../auth-form";

async function loadResetPassword() {
  if (!(await verifiedUser(await createClient()))) redirect("/auth/error");
  return { model: {} };
}

const ResetPassword = createScreen(loadResetPassword, () => (
  <>
    <UI.Heading1>Choose a new password</UI.Heading1>
    <UI.Paragraph>
      Saving signs out your sessions. Sign in again with your new password.
    </UI.Paragraph>
    <AuthForm mode="reset" />
    <Link href="/app">Back to your account</Link>
  </>
));
export default ResetPassword;
