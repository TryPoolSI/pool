import { router } from "expo-router";
import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import Link from "@/ui/link";
import { colors, spacing } from "@/ui/styles";
import {
  PageHeading,
  ActionDialog,
  Avatar,
  Icon,
  StatusBadge,
} from "../../presentation";
import { notFound } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/client";
import { verifiedUser } from "@/lib/auth/identity";
import {
  ConfirmRemoval,
  InviteForm,
  MembershipForm,
  NameField,
} from "../../membership-form";
import { InvitationList } from "../../invitation-list";
import { FamilyChildren } from "../family-children";
import { FamilyVehicleSetup } from "../family-vehicle-setup";

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
  if (family.error) throw new Error("Pool couldn’t load this family.");
  if (!family.data || !user) notFound();
  const [members, circles] = await Promise.all([
    client
      .from("family_members")
      .select("user_id,role,profiles(display_name)")
      .eq("family_id", id),
    client
      .from("circles")
      .select("id,name,coordinator_family_id")
      .order("name"),
  ]);
  if (members.error || circles.error)
    throw new Error("Pool couldn’t load this family.");
  const owner = members.data.some(
    (member) => member.user_id === user.id && member.role === "owner",
  );
  return {
    model: {
      id: family.data.id,
      user,
      family: family.data,
      members,
      circles: circles.data,
      owner,
    },
  };
}

const sectionTitle = { marginBottom: 0 } as const;
const personRow = {
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.md,
  paddingVertical: spacing.md,
  borderTopWidth: 1,
  borderTopColor: colors.line,
} as const;

const FamilyPage = createScreen(
  loadFamilyPage,
  ({ id, user, family, members, circles, owner }) => {
    const owners = members.data.filter((member) => member.role === "owner");
    // A family keeps at least one owner, so its only owner cannot leave.
    const canLeave = !(owner && owners.length === 1);
    return (
      <>
        <PageHeading title={family.name}>
          The adults and children in your household.
        </PageHeading>
        <FamilyChildren
          key={`children:${user.id}:${id}`}
          userId={user.id}
          familyId={id}
        />
        <FamilyVehicleSetup
          key={`vehicles:${user.id}:${id}`}
          userId={user.id}
          familyId={id}
        />

        <UI.Section>
          <UI.Box className="section-head">
            <UI.Heading2 style={sectionTitle}>Guardians</UI.Heading2>
            {owner && (
              <ActionDialog title="Invite a guardian">
                <UI.Paragraph style={{ marginTop: 0 }}>
                  A guardian can manage this family’s children and rides.
                </UI.Paragraph>
                <InviteForm kind="guardian" scopeId={id} />
              </ActionDialog>
            )}
          </UI.Box>
          <UI.Box role="list" aria-label="Guardians">
            {members.data.map((member) => {
              const self = member.user_id === user.id;
              const name = member.profiles?.display_name || "Guardian";
              return (
                <UI.Box key={member.user_id} role="listitem" style={personRow}>
                  <Avatar name={name} />
                  <UI.Box style={{ flex: 1 }}>
                    <UI.Strong>{name}</UI.Strong>
                    <UI.Small style={{ color: colors.muted }}>
                      {member.role === "owner" ? "Owner" : "Guardian"}
                    </UI.Small>
                  </UI.Box>
                  {self && (
                    <UI.Box style={{ alignSelf: "center" }}>
                      <StatusBadge>You</StatusBadge>
                    </UI.Box>
                  )}
                  {owner && !self && (
                    <ActionDialog
                      title={`Remove ${name}`}
                      triggerLabel="Remove"
                      tone="danger"
                      compact
                    >
                      <UI.Paragraph style={{ marginTop: 0 }}>
                        {name} will lose access to this family’s children and
                        rides. You can invite them again later.
                      </UI.Paragraph>
                      <MembershipForm
                        command="remove-guardian"
                        fields={{ family_id: id, user_id: member.user_id }}
                        label="Remove guardian"
                        tone="danger"
                        successMessage={`${name} removed`}
                      >
                        <ConfirmRemoval>
                          Remove {name} from the family
                        </ConfirmRemoval>
                      </MembershipForm>
                    </ActionDialog>
                  )}
                </UI.Box>
              );
            })}
          </UI.Box>
          {owner && <InvitationList kind="guardian" scopeId={id} />}
        </UI.Section>

        <UI.Section>
          <UI.Box className="section-head">
            <UI.Heading2 style={sectionTitle}>Circles</UI.Heading2>
            {owner && (
              <ActionDialog title="Create a circle">
                <UI.Paragraph style={{ marginTop: 0 }}>
                  A circle is the group of families you share rides with. Your
                  family joins it, and you invite the others.
                </UI.Paragraph>
                <MembershipForm
                  command="create-circle"
                  fields={{ family_id: id }}
                  label="Create circle"
                  creates
                >
                  <NameField
                    label="Circle name"
                    placeholder="Oak Street carpool"
                  />
                </MembershipForm>
              </ActionDialog>
            )}
          </UI.Box>
          {circles.length ? (
            <UI.Box role="list" aria-label="Circles">
              {circles.map((circle) => (
                <UI.Box
                  key={circle.id}
                  role="listitem"
                  style={{ borderTopWidth: 1, borderTopColor: colors.line }}
                >
                  <Link
                    href={`/app/circles/${circle.id}`}
                    aria-label={circle.name}
                    style={{
                      alignSelf: "stretch",
                      paddingVertical: spacing.sm,
                    }}
                  >
                    <UI.Box className="team-icon">
                      <Icon name="users" />
                    </UI.Box>
                    <UI.Box style={{ flex: 1 }}>
                      <UI.Strong>{circle.name}</UI.Strong>
                      {circle.coordinator_family_id === id && (
                        <UI.Small style={{ color: colors.muted }}>
                          Organizer
                        </UI.Small>
                      )}
                    </UI.Box>
                    <Icon name="chevron-right" size={16} color={colors.muted} />
                  </Link>
                </UI.Box>
              ))}
            </UI.Box>
          ) : (
            <UI.Paragraph style={{ marginVertical: 0 }}>
              A circle is the group of families you share rides with.{" "}
              {owner
                ? "Create one, or join one with an invitation link."
                : "Your family’s owner can create one or join one."}
            </UI.Paragraph>
          )}
        </UI.Section>

        {canLeave && (
          <ActionDialog
            title="Leave family"
            tone="danger"
            triggerStyle={{ marginTop: spacing.md }}
          >
            <UI.Paragraph style={{ marginTop: 0 }}>
              You’ll lose access to {family.name}’s children and rides. To come
              back, you’ll need a new invitation.
            </UI.Paragraph>
            <MembershipForm
              command="remove-guardian"
              fields={{ family_id: id, user_id: user.id }}
              label="Leave family"
              tone="danger"
              successMessage={`You left ${family.name}`}
              onResult={(result) => {
                if (!result.error) router.replace("/app/profile");
              }}
            >
              <ConfirmRemoval>Leave {family.name}</ConfirmRemoval>
            </MembershipForm>
          </ActionDialog>
        )}
      </>
    );
  },
);
export default FamilyPage;
