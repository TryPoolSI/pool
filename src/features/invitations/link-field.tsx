import * as UI from "@/ui/elements";
import { styles } from "@/ui/styles";

export const invalidInvitationLink =
  "That isn’t a full Pool invitation link. Copy the whole link from the message you were sent and paste it again.";

export function InvitationLinkField({
  value,
  onChange,
  hint,
}: {
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <UI.Label>
      Invitation link
      <UI.Field
        name="invitation_link"
        type="url"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
      />
      {hint ? <UI.Inline style={styles.hint}>{hint}</UI.Inline> : null}
    </UI.Label>
  );
}
