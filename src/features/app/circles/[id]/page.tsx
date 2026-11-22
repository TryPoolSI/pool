import { router } from "expo-router";
import * as UI from "@/ui/elements";
import { createScreen } from "@/ui/remote";
import { colors, spacing } from "@/ui/styles";
import {
  PageHeading,
  ActionDialog,
  Avatar,
  StatusBadge,
} from "../../presentation";
import { notFound } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/client";
import { verifiedUser } from "@/lib/auth/identity";
import { familyPath, useActiveFamily } from "@/services/active-family";
import {
  ConfirmRemoval,
  InviteForm,
  MembershipForm,
} from "../../membership-form";
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
  if (circle.error) throw new Error("Pool couldn’t load this circle.");
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
    throw new Error("Pool couldn’t load this circle.");
  const coordinator = currentCircle.coordinator_id === user.id;
  return { model: { id, currentCircle, roster, owned, coordinator } };
}

const familyRow = {
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.md,
  paddingVertical: spacing.md,
  borderTopWidth: 1,
  borderTopColor: colors.line,
} as const;

type CircleModel = Awaited<ReturnType<typeof loadCirclePage>>["model"];

function Circle({ id, currentCircle, roster, owned, coordinator }: CircleModel) {
  const { data: mine } = useActiveFamily();
  const organizerFamily = currentCircle.coordinator_family_id;
  // A family's owner can take it out of a circle it does not organize.
  const leaving = coordinator
    ? undefined
    : roster.data.find(
        (family) =>
          family.family_id !== organizerFamily &&
          owned.data.some((member) => member.family_id === family.family_id),
      );
  return (
    <>
      <PageHeading title={currentCircle.name}>
        A circle is the group of families you share rides with.
      </PageHeading>
      <UI.Section>
        <UI.Box className="section-head">
          <UI.Heading2 style={{ marginBottom: 0 }}>Families</UI.Heading2>
          {coordinator && (
            <ActionDialog
              title="Invite a family"
              tone={roster.data.length < 2 ? "primary" : "secondary"}
            >
              <UI.Paragraph style={{ marginTop: 0 }}>
                Invite an adult from another household. They join this circle
                with their own family.
              </UI.Paragraph>
              <InviteForm kind="circle" scopeId={id} />
            </ActionDialog>
          )}
        </UI.Box>
        <UI.Box role="list" aria-label="Families">
          {roster.data.map((family) => (
            <UI.Box key={family.family_id} role="listitem" style={familyRow}>
              <Avatar name={family.family_name} />
              <UI.Box style={{ flex: 1 }}>
                <UI.Strong>{family.family_name}</UI.Strong>
                {family.family_id === organizerFamily && (
                  <UI.Small style={{ color: colors.muted }}>Organizer</UI.Small>
                )}
              </UI.Box>
              {family.family_id === mine?.id && (
                <UI.Box style={{ alignSelf: "center" }}>
                  <StatusBadge>Your family</StatusBadge>
                </UI.Box>
              )}
              {coordinator && family.family_id !== organizerFamily && (
                <ActionDialog
                  title={`Remove ${family.family_name}`}
                  triggerLabel="Remove"
                  tone="danger"
                  compact
                >
                  <UI.Paragraph style={{ marginTop: 0 }}>
                    {family.family_name} will no longer see or join rides in{" "}
                    {currentCircle.name}. You can invite them again later.
                  </UI.Paragraph>
                  <MembershipForm
                    command="remove-family"
                    fields={{ circle_id: id, family_id: family.family_id }}
                    label="Remove family"
                    tone="danger"
                    successMessage={`${family.family_name} removed`}
                  >
                    <ConfirmRemoval>
                      Remove {family.family_name} from {currentCircle.name}
                    </ConfirmRemoval>
                  </MembershipForm>
                </ActionDialog>
              )}
            </UI.Box>
          ))}
        </UI.Box>
        {roster.data.length < 2 && (
          <UI.Paragraph style={{ marginBottom: 0 }}>
            {coordinator
              ? "It’s only your family so far. Invite another family to start sharing rides."
              : "It’s only one family so far. The organizer can invite more."}
          </UI.Paragraph>
        )}
        {coordinator && <InvitationList kind="circle" scopeId={id} />}
      </UI.Section>

      {leaving && (
        <ActionDialog
          title="Leave circle"
          tone="danger"
          triggerStyle={{ marginTop: spacing.md }}
        >
          <UI.Paragraph style={{ marginTop: 0 }}>
            {leaving.family_name} will no longer see or join rides in{" "}
            {currentCircle.name}. To come back, you’ll need a new invitation.
          </UI.Paragraph>
          <MembershipForm
            command="remove-family"
            fields={{ circle_id: id, family_id: leaving.family_id }}
            label="Leave circle"
            tone="danger"
            successMessage={`You left ${currentCircle.name}`}
            onResult={(result) => {
              if (!result.error)
                router.replace(familyPath(leaving.family_id) as never);
            }}
          >
            <ConfirmRemoval>
              Take {leaving.family_name} out of {currentCircle.name}
            </ConfirmRemoval>
          </MembershipForm>
        </ActionDialog>
      )}
    </>
  );
}

const CirclePage = createScreen(loadCirclePage, (model) => (
  <Circle {...model} />
));
export default CirclePage;
