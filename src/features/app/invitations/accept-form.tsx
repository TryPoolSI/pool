import { useEffect, useState } from "react";
import { router } from "expo-router";
import * as UI from "@/ui/elements";
import Link from "@/ui/link";
import { CommandForm } from "@/ui/command-form";
import { AuthForm } from "@/features/auth/auth-form";
import {
  InvitationLinkField,
  invalidInvitationLink,
} from "@/features/invitations/link-field";
import { membershipAction } from "@/services/membership-actions";
import { familyPath, type ActiveFamily } from "@/services/active-family";
import { useSession } from "@/services/session";
import type { MembershipState } from "@/lib/membership";
import { MembershipForm, NameField } from "../membership-form";
import {
  onInvitation,
  rememberInvitation,
  invitationParts,
} from "@/services/invitation-link";

export function AcceptInvitation({
  family,
  membershipReady,
}: {
  family: ActiveFamily | null | undefined;
  membershipReady: boolean;
}) {
  const [link, setLink] = useState("");
  const [invalid, setInvalid] = useState(false);
  useEffect(
    () =>
      onInvitation((value) => {
        setLink(value);
        setInvalid(Boolean(value) && !invitationParts(value));
      }),
    [],
  );
  const parsed = invitationParts(link);
  return (
    <>
      <UI.Paragraph>
        A guardian invitation lets you join an existing family. A circle
        invitation lets your own family join a circle.
      </UI.Paragraph>
      <UI.Paragraph>
        Sign in with the invited email, then open the link or paste it here.
        Check the invitation before you accept.
      </UI.Paragraph>
      <InvitationLinkField
        value={link}
        onChange={(value) => {
          setInvalid(false);
          setLink(value);
        }}
      />
      {invalid && (
        <UI.Paragraph role="alert">{invalidInvitationLink}</UI.Paragraph>
      )}
      <InvitationDecision
        key={parsed ? `${parsed.kind}-${parsed.token}` : "empty"}
        link={link}
        parsed={parsed}
        family={family}
        membershipReady={membershipReady}
      />
    </>
  );
}

function InvitationDecision({
  link,
  parsed,
  family,
  membershipReady,
}: {
  link: string;
  parsed: ReturnType<typeof invitationParts>;
  family: ActiveFamily | null | undefined;
  membershipReady: boolean;
}) {
  const [preview, setPreview] = useState<MembershipState["preview"]>();
  const [issue, setIssue] = useState<MembershipState["issue"]>();
  const { user } = useSession();
  const kind = parsed?.kind;
  const circleRequiresOwner = kind === "circle" && family?.role === "guardian";
  const invitationSummary = preview && (
    <>
      <UI.Heading2>
        {kind === "guardian" ? "Join family" : "Join circle"}: {preview.name}
      </UI.Heading2>
      <UI.Paragraph>
        Expires {new Date(preview.expires).toISOString().slice(0, 10)} (UTC).
      </UI.Paragraph>
    </>
  );
  return (
    <>
      <CommandForm
        action={async () => {
          // The signed-in user can continue checking even if persistence is unavailable.
          void rememberInvitation(link).catch(() => {});
          if (!parsed)
            return link.trim() ? undefined : { error: invalidInvitationLink };
          return membershipAction(
            {},
            { command: "preview-invitation", ...parsed },
          );
        }}
        label="Check invitation"
        onResult={(result) => {
          setPreview(result.preview);
          setIssue(result.issue);
        }}
      />
      {invitationSummary}
      {preview && circleRequiresOwner && (
        <UI.Paragraph role="status">
          Ask the circle coordinator to send an invitation to your family’s
          owner. A family owner can accept on behalf of your family.
        </UI.Paragraph>
      )}
      {preview && parsed && family !== undefined && !circleRequiresOwner && (
        <MembershipForm
          command="accept-invitation"
          fields={parsed}
          label="Accept invitation"
          disabled={!membershipReady}
          creates
          onResult={(result) => {
            setIssue(result.issue);
            if (!result.error && result.path)
              router.replace(result.path as never);
          }}
        >
          <NameField name="display_name" label="Your display name" />
          {kind === "circle" && (
            <>
              <UI.Label>
                Family to join the circle
                <UI.Select name="family_choice" value={family?.id ?? "new"}>
                  {family ? (
                    <UI.Option value={family.id}>{family.name}</UI.Option>
                  ) : (
                    <UI.Option value="new">Create a new family</UI.Option>
                  )}
                </UI.Select>
              </UI.Label>
              {!family && <NameField />}
              <UI.Paragraph>Accept on behalf of your own family.</UI.Paragraph>
            </>
          )}
          <UI.Label className="checkbox-label">
            <UI.Field type="checkbox" name="accept" value="yes" required />I
            explicitly accept this{" "}
            {kind === "guardian" ? "family guardian" : "circle family"}{" "}
            membership.
          </UI.Label>
        </MembershipForm>
      )}
      {issue === "invite-unavailable" && (
        <>
          <UI.Paragraph>
            You’re signed in as {user?.email}. Use the email address on your
            invitation.
          </UI.Paragraph>
          <AuthForm mode="switch-account" />
        </>
      )}
      {(issue === "active-family" || issue === "retry-membership") &&
        family && <Link href={familyPath(family.id)}>My family</Link>}
    </>
  );
}
