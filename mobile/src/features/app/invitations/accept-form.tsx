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
export function AcceptInvitation({
  families,
}: {
  families: { id: string; name: string }[];
}) {
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
        families={families}
      />
    </>
  );
}
function InvitationDecision({
  kind,
  token,
  families,
}: {
  kind: string;
  token: string;
  families: { id: string; name: string }[];
}) {
  const [preview, setPreview] = useState<{ name: string; expires: string }>();
  const [choice, setChoice] = useState(families[0]?.id ?? "new");
  return (
    <>
      <CommandForm
        action={(values) => membershipAction({}, values)}
        fields={{ command: "preview-invitation", kind, token }}
        label="Check invitation"
        onResult={(result) => setPreview(result.preview)}
      />
      {preview && (
        <CommandForm
          action={(values) => membershipAction({}, values)}
          fields={{ command: "accept-invitation", kind, token }}
          label="Accept invitation"
          resultLabel="Open saved membership"
          onResult={(result) => {
            if (!result.error) void forgetInvitation();
          }}
        >
          <UI.Heading2>
            {kind === "guardian" ? "Join family" : "Join circle"}:{" "}
            {preview.name}
          </UI.Heading2>
          <UI.Paragraph>
            Expires {new Date(preview.expires).toISOString().slice(0, 10)}{" "}
            (UTC).
          </UI.Paragraph>
          <NameField name="display_name" label="Your display name" />
          {kind === "circle" && (
            <>
              <UI.Label>
                Family to join the circle
                <UI.Select
                  name="family_choice"
                  value={choice}
                  onChange={(e) => setChoice(e.target.value)}
                >
                  {families.map((f) => (
                    <UI.Option key={f.id} value={f.id}>
                      {f.name}
                    </UI.Option>
                  ))}
                  <UI.Option value="new">Create a new family</UI.Option>
                </UI.Select>
              </UI.Label>
              {choice === "new" && <NameField />}
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
