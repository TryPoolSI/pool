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
    .select("families(id,name)")
    .eq("user_id", user.id)
    .eq("role", "owner");
  if (error) throw new Error("Families could not be loaded");
  return { model: { data } };
}

const InvitationsPage = createScreen(loadInvitationsPage, ({ data }) => (
  <>
    <UI.Heading1>Accept an invitation</UI.Heading1>
    <AcceptInvitation
      families={data.flatMap((member) =>
        member.families ? [member.families] : [],
      )}
    />
  </>
));
export default InvitationsPage;
