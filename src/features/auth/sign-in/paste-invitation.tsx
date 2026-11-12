import { useState } from "react";
import { router } from "expo-router";
import { INVITATIONS_PATH } from "@/lib/auth/paths";
import {
  invitationParts,
  rememberInvitation,
} from "@/services/invitation-link";
import { CommandForm } from "@/ui/command-form";
import * as UI from "@/ui/elements";
import {
  InvitationLinkField,
  invalidInvitationLink,
} from "@/features/invitations/link-field";

export function PasteInvitation() {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  return (
    <>
      <UI.Button onPress={() => setOpen(!open)}>
        Have an invitation link?
      </UI.Button>
      {open && (
        <CommandForm
          label="Use invitation link"
          action={async () => {
            const valid = invitationParts(link);
            try {
              await rememberInvitation(link);
            } catch {
              return {
                error:
                  "Pool could not save the link. Try again, or sign in and paste it under Invitations.",
              };
            }
            if (!valid) return { error: invalidInvitationLink };
            router.setParams({ next: INVITATIONS_PATH });
            setLink("");
            setOpen(false);
          }}
        >
          <InvitationLinkField value={link} onChange={setLink} />
        </CommandForm>
      )}
    </>
  );
}
