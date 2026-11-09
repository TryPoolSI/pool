import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import Link from "@/ui/link";
import {
  PageHeading,
  Disclosure,
  ActionDialog,
  Avatar,
} from "../../presentation";
import { notFound } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/client";
import { verifiedUser } from "@/lib/auth/identity";
import { InviteForm, MembershipForm, NameField } from "../../membership-form";
import { InvitationList } from "../../invitation-list";

async function loadFamilyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) notFound();
  const client = await createClient();
  const user = await verifiedUser(client);
  const family = await client
    .from("families")
    .select("id,name")
    .eq("id", id)
    .maybeSingle();
  if (family.error) throw new Error("Family could not be loaded");
  if (!family.data || !user) notFound();
  const members = await client
    .from("family_members")
    .select("user_id,role,profiles(display_name)")
    .eq("family_id", id);
  if (members.error) throw new Error("Members could not be loaded");
  const owner = members.data.some(
    (member) => member.user_id === user.id && member.role === "owner",
  );
  return { model: { id, user, family, members, owner } };
}

const FamilyPage = createScreen(
  loadFamilyPage,
  ({ id, user, family, members, owner }) => (
    <>
      <PageHeading
        title={family.data!.name}
        action={
          <Link
            className="button secondary"
            href={`/app/children?family=${id}`}
          >
            Your children
          </Link>
        }
      />
      <UI.Heading2>Guardians</UI.Heading2>
      <UI.List>
        {members.data.map((member) => (
          <UI.ListItem key={member.user_id}>
            <UI.Box className="person-meta">
              <Avatar name={member.profiles?.display_name || "Guardian"} />
              <UI.Inline>
                {member.profiles?.display_name} · {member.role}
              </UI.Inline>
            </UI.Box>
            {member.user_id === user.id ? " (you)" : ""}
            {(owner || member.user_id === user.id) && (
              <Disclosure
                title={
                  member.user_id === user.id
                    ? "Leave family"
                    : "Remove guardian"
                }
              >
                <MembershipForm
                  command="remove-guardian"
                  fields={{ family_id: id, user_id: member.user_id }}
                  label={
                    member.user_id === user.id
                      ? "Leave family"
                      : "Remove guardian"
                  }
                >
                  <UI.Label className="checkbox-label">
                    <UI.Field
                      type="checkbox"
                      name="confirm"
                      value="yes"
                      required
                    />
                    I confirm this membership removal.
                  </UI.Label>
                </MembershipForm>
              </Disclosure>
            )}
          </UI.ListItem>
        ))}
      </UI.List>

      {owner && (
        <>
          <ActionDialog title="Invite a guardian">
            <UI.Paragraph>
              They can manage this family’s children and rides. Share the
              invitation link yourself.
            </UI.Paragraph>
            <InviteForm kind="guardian" scopeId={id} />
          </ActionDialog>
          <InvitationList kind="guardian" scopeId={id} />
          <ActionDialog title="Create a circle">
            <UI.Paragraph>
              Your family joins automatically. You coordinate the circle.
            </UI.Paragraph>
            <MembershipForm
              command="create-circle"
              fields={{ family_id: id }}
              label="Create circle"
            >
              <NameField label="Circle name" />
            </MembershipForm>
          </ActionDialog>
        </>
      )}
    </>
  ),
);
export default FamilyPage;
