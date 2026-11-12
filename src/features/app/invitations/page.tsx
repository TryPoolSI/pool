import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import { redirect } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/client";
import { verifiedUser } from "@/lib/auth/identity";
import { AcceptInvitation } from "./accept-form";
async function loadInvitationsPage() {
  const client = await createClient();
  const user = await verifiedUser(client);
  if (!user) redirect("/sign-in?next=/app/invitations");
  const { data, error } = await client
    .from("family_members")
    .select("role,families(id,name)")
    .eq("user_id", user.id)
    .is("removed_at", null)
    .maybeSingle();
  if (error) throw new Error("Families could not be loaded");
  return {
    model: {
      family: data?.families ? { ...data.families, role: data.role } : null,
    },
  };
}

const InvitationsPage = createScreen(loadInvitationsPage, ({ family }) => (
  <>
    <UI.Heading1>Accept an invitation</UI.Heading1>
    <AcceptInvitation family={family} />
  </>
));
export default InvitationsPage;
