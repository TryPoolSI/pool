import { useState } from "react";
import * as UI from "@/ui/elements";
import Link from "@/ui/link";
import { colors, styles } from "@/ui/styles";
import { familyPath, useActiveFamily } from "@/services/active-family";
import { useSession } from "@/services/session";
import { INVITATIONS_PATH } from "@/lib/auth/paths";
import { FamilyMembershipStatus } from "../family-membership-status";
import { MembershipForm, NameField } from "../membership-form";
import { Avatar, Icon, PageHeading } from "../presentation";

export default function Profile() {
  const membership = useActiveFamily();
  const { user } = useSession();
  const family = membership.data;
  // Once the welcome is on screen it stays until the new family opens, so the
  // form is still there to finish the hand-off when the family appears.
  const [welcome, setWelcome] = useState(false);
  if (!welcome && membership.isSuccess && family === null) setWelcome(true);

  // No family yet: this is the first screen after sign-up, so it welcomes the
  // person and asks for the two things Pool cannot work out.
  if (welcome)
    return (
      <>
        <PageHeading title="Welcome to Pool">
          Start with your family: the adults and children in your household.
        </PageHeading>
        <UI.Section style={{ maxWidth: styles.form.maxWidth, width: "100%" }}>
          <MembershipForm
            command="create-family"
            label="Create family"
            creates
            disabled={membership.isFetching || Boolean(family)}
          >
            <NameField label="Your name" name="display_name" />
            <NameField placeholder="The Riveras" />
          </MembershipForm>
        </UI.Section>
        {family ? (
          <Link href={familyPath(family.id)}>Open My family</Link>
        ) : (
          <>
            <UI.Paragraph style={{ marginBottom: 0 }}>
              Invited to a family or a circle that already exists?
            </UI.Paragraph>
            <Link href={INVITATIONS_PATH}>Join with an invitation link</Link>
          </>
        )}
      </>
    );

  return (
    <>
      <PageHeading title="Profile">
        {user?.email ? `Signed in as ${user.email}` : undefined}
      </PageHeading>
      {!family && <FamilyMembershipStatus membership={membership} />}
      {family && (
        <UI.Section>
          <UI.Heading2>Your family</UI.Heading2>
          <Link
            href={familyPath(family.id)}
            aria-label="My family"
            style={{ alignSelf: "stretch" }}
          >
            <Avatar name={family.name} />
            <UI.Strong style={{ flex: 1 }}>{family.name}</UI.Strong>
            <Icon name="chevron-right" size={16} color={colors.muted} />
          </Link>
        </UI.Section>
      )}
    </>
  );
}
