import { Redirect, Slot, usePathname } from "expo-router";
import { useSession } from "@/services/session";
import { ApplicationShell } from "@/ui/shell";
import { Paragraph } from "@/ui/elements";
import { SessionProblem } from "@/ui/session-problem";
export default function AppLayout() {
  const { user, ready, ended, error } = useSession();
  const pathname = usePathname();
  if (error) return <SessionProblem />;
  if (!ready)
    return <Paragraph role="status">Checking your session…</Paragraph>;
  if (!user)
    return (
      <Redirect
        href={{
          pathname: "/sign-in",
          params: ended ? { message: ended } : { next: pathname },
        }}
      />
    );
  return (
    <ApplicationShell>
      <Slot />
    </ApplicationShell>
  );
}
