import { useEffect, useState } from "react";
import * as UI from "@/ui/elements";
import { CommandForm } from "@/ui/command-form";
import { membershipAction } from "@/services/membership-actions";
import { NameField } from "../membership-form";
import {
  onInvitation,
  rememberInvitation,
  invitationParts,
  forgetInvitation,
} from "@/services/invitation-link";
type ActiveFamily = { id: string; name: string; role: string };

export function AcceptInvitation({ family }: { family: ActiveFamily | null }) {
  const [link, setLink] = useState("");
  useEffect(() => onInvitation(setLink), []);
  const parsed = invitationParts(link);
  return (
    <>
      <UI.Paragraph>
        Sign in with the invited email, then open your link or paste it here.
        Opening a link does not accept it.
      </UI.Paragraph>
      <UI.Label>
        Invitation link
        <UI.Field
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            void rememberInvitation(e.target.value);
          }}
        />
      </UI.Label>
      <InvitationDecision
        key={`${parsed?.kind}-${parsed?.token}`}
        kind={parsed?.kind ?? ""}
        token={parsed?.token ?? ""}
        family={family}
      />
    </>
  );
}
function InvitationDecision({
  kind,
  token,
  family,
}: {
  kind: string;
  token: string;
  family: ActiveFamily | null;
}) {
  const [preview, setPreview] = useState<{ name: string; expires: string }>();
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
        action={(values) => membershipAction({}, values)}
        fields={{ command: "preview-invitation", kind, token }}
        label="Check invitation"
        onResult={(result) => setPreview(result.preview)}
      />
      {preview && circleRequiresOwner && (
        <>
          {invitationSummary}
          <UI.Paragraph role="status">
            Ask the circle coordinator to send an invitation to your family’s
            owner. A family owner can accept on behalf of your family.
          </UI.Paragraph>
        </>
      )}
      {preview && !circleRequiresOwner && (
        <CommandForm
          action={(values) => membershipAction({}, values)}
          fields={{ command: "accept-invitation", kind, token }}
          label="Accept invitation"
          resultLabel="Open saved membership"
          onResult={(result) => {
            if (!result.error) void forgetInvitation();
          }}
        >
          {invitationSummary}
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
              <UI.Paragraph>
                Only families you own are available. This does not join the
                inviter’s family or grant driver approval.
              </UI.Paragraph>
            </>
          )}
          <UI.Label className="checkbox-label">
            <UI.Field type="checkbox" name="accept" value="yes" required />I
            explicitly accept this{" "}
            {kind === "guardian" ? "family guardian" : "circle family"}{" "}
            membership.
          </UI.Label>
        </CommandForm>
      )}
    </>
  );
}
