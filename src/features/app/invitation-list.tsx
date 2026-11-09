import * as UI from "@/ui/elements";
import { createPanel } from "@/ui/remote";
import { Disclosure } from "./presentation";
import { createClient } from "@/lib/supabase/client";
import { MembershipForm } from "./membership-form";

async function loadInvitationList({
  kind,
  scopeId,
}: {
  kind: "guardian" | "circle";
  scopeId: string;
}) {
  const client = await createClient();
  const { data, error } = await client.rpc("list_invitations", {
    p_kind: kind,
    p_scope_id: scopeId,
  });
  if (error) throw new Error("Invitations could not be loaded");
  return { model: { data } };
}

export const InvitationList = createPanel(
  "loadInvitationList",
  loadInvitationList,
  ({ data }) => (
    <Disclosure title="Invitation history">
      {!data.length && (
        <UI.Paragraph>No invitations have been created here.</UI.Paragraph>
      )}
      <UI.List>
        {data.map((invitation) => (
          <UI.ListItem key={invitation.id}>
            <UI.Strong>{invitation.email}</UI.Strong> —{" "}
            {invitation.consumed_at
              ? "Accepted"
              : invitation.revoked_at
                ? "Revoked"
                : `Expires ${new Date(invitation.expires_at).toISOString().slice(0, 10)} (UTC)`}
            {!invitation.consumed_at && !invitation.revoked_at && (
              <MembershipForm
                command="revoke-invitation"
                fields={{ invitation_id: invitation.id }}
                label="Revoke invitation"
              />
            )}
          </UI.ListItem>
        ))}
      </UI.List>
    </Disclosure>
  ),
);
