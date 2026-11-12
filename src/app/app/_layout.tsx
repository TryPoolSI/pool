import {
  Redirect,
  Slot,
  useGlobalSearchParams,
  usePathname,
} from "expo-router";
import { useSession } from "@/services/session";
import { ApplicationShell } from "@/ui/shell";
import { Paragraph } from "@/ui/elements";
import { SessionProblem } from "@/ui/session-problem";
import { INVITATION_SIGN_IN, protectedReturnPath } from "@/lib/auth/paths";
export default function AppLayout() {
  const { user, ready, ended, error } = useSession();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  if (error) return <SessionProblem />;
  if (!ready)
    return <Paragraph role="status">Checking your session…</Paragraph>;
  if (!user && ended === "switch-account")
    return <Redirect href={INVITATION_SIGN_IN} />;
  if (!user)
    return (
      <Redirect
        href={{
          pathname: "/sign-in",
          params: ended
            ? { message: ended }
            : { next: protectedReturnPath(pathname, params) },
        }}
      />
    );
  return (
    <ApplicationShell>
      <Slot />
    </ApplicationShell>
  );
}
