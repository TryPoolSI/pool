import * as UI from "@/ui/elements";

export const invalidInvitationLink =
  "Paste the full Pool invitation link that was shared with you.";

export function InvitationLinkField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
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
    </UI.Label>
  );
}
