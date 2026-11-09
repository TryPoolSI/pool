import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import {
  PageHeading,
  Disclosure,
  ActionDialog,
  Avatar,
} from "../../presentation";
import { notFound } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/client";
import { verifiedUser } from "@/lib/auth/identity";
import { InviteForm, MembershipForm } from "../../membership-form";
import { InvitationList } from "../../invitation-list";

async function loadCirclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) notFound();
  const client = await createClient();
  const user = await verifiedUser(client);
  const circle = await client
    .from("circles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (circle.error) throw new Error("Circle could not be loaded");
  if (!circle.data || !user) notFound();
  const currentCircle = circle.data;
  const [roster, owned] = await Promise.all([
    client.rpc("circle_roster", { p_circle_id: id }),
    client
      .from("family_members")
      .select("family_id")
      .eq("user_id", user.id)
      .eq("role", "owner"),
  ]);
  if (roster.error || owned.error)
    throw new Error("Roster could not be loaded");
  const coordinator = currentCircle.coordinator_id === user.id;
  return { model: { id, currentCircle, roster, owned, coordinator } };
}

const CirclePage = createScreen(
  loadCirclePage,
  ({ id, currentCircle, roster, owned, coordinator }) => (
    <>
      <PageHeading title={currentCircle.name} />
      <UI.Heading2>Families in this circle</UI.Heading2>
      <UI.List>
        {roster.data.map((family) => (
          <UI.ListItem key={family.family_id}>
            <UI.Box className="person-meta">
              <Avatar name={family.family_name} />
              <UI.Strong>{family.family_name}</UI.Strong>
            </UI.Box>
            {family.family_id === currentCircle.coordinator_family_id
              ? " (coordinating family)"
              : ""}
            {(coordinator ||
              owned.data.some(
                (member) => member.family_id === family.family_id,
              )) &&
              family.family_id !== currentCircle.coordinator_family_id && (
                <Disclosure
                  title={coordinator ? "Remove family" : "Leave circle"}
                >
                  <MembershipForm
                    command="remove-family"
                    fields={{ circle_id: id, family_id: family.family_id }}
                    label={
                      coordinator ? "Remove family from circle" : "Leave circle"
                    }
                  >
                    <UI.Label className="checkbox-label">
                      <UI.Field
                        type="checkbox"
                        name="confirm"
                        value="yes"
                        required
                      />
                      I confirm this family’s removal from the circle.
                    </UI.Label>
                  </MembershipForm>
                </Disclosure>
              )}
          </UI.ListItem>
        ))}
      </UI.List>

      {coordinator && (
        <>
          <ActionDialog title="Invite another family">
            <UI.Paragraph>
              Invite an adult to join this circle with their own family. Share
              the invitation link yourself.
            </UI.Paragraph>
            <InviteForm kind="circle" scopeId={id} />
          </ActionDialog>
          <InvitationList kind="circle" scopeId={id} />
        </>
      )}
    </>
  ),
);
export default CirclePage;
