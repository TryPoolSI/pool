import { useState } from "react";
import { router } from "expo-router";
import * as UI from "@/ui/elements";
import Link from "@/ui/link";
import { familyPath, useActiveFamily } from "@/services/active-family";
import { INVITATIONS_PATH } from "@/lib/auth/paths";
import { FamilyMembershipStatus } from "../family-membership-status";
import { MembershipForm, NameField } from "../membership-form";

export default function Profile() {
  const membership = useActiveFamily();
  const [creating, setCreating] = useState(false);
  const family = membership.data;
  const canSetUp =
    family === null && membership.isSuccess && !membership.isFetching;

  return (
    <>
      <UI.Heading1>Profile</UI.Heading1>
      <FamilyMembershipStatus membership={membership} />
      {family && (
        <UI.Section className="panel">
          <UI.Heading2>{family.name}</UI.Heading2>
          <Link className="button secondary" href={familyPath(family.id)}>
            My family
          </Link>
        </UI.Section>
      )}
      {(canSetUp || creating) && (
        <UI.Section className="panel">
          <UI.Heading2>Set up your family</UI.Heading2>
          {canSetUp && !creating && (
            <UI.Button onPress={() => setCreating(true)}>
              Create a family
            </UI.Button>
          )}
          {creating && (
            <MembershipForm
              command="create-family"
              label="Create family"
              creates
              disabled={!canSetUp}
              onResult={(result) => {
                if (!result.error && result.path)
                  router.replace(result.path as never);
              }}
            >
              <NameField label="Your name" name="display_name" />
              <UI.Paragraph>
                Your name is the personal name other guardians will see.
              </UI.Paragraph>
              <NameField />
            </MembershipForm>
          )}
          {canSetUp && (
            <>
              <Link className="button secondary" href={INVITATIONS_PATH}>
                Join a family
              </Link>
              <UI.Paragraph>
                Ask a family owner to share a guardian invitation link. Sign in
                with the email address they invited.
              </UI.Paragraph>
            </>
          )}
        </UI.Section>
      )}
    </>
  );
}
