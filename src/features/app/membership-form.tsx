import * as UI from "@/ui/elements";
import { CommandForm } from "@/ui/command-form";
import { membershipAction } from "@/services/membership-actions";
export function MembershipForm({
  command,
  fields = {},
  label,
  children,
}: {
  command: string;
  fields?: Record<string, string>;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <CommandForm
      action={(values) => membershipAction({}, values)}
      fields={{ command, ...fields }}
      label={label}
      resultLabel="Open saved membership"
    >
      {children}
    </CommandForm>
  );
}
export function NameField({
  label = "Family name",
  name = "name",
}: {
  label?: string;
  name?: string;
}) {
  return (
    <UI.Label>
      {label}
      <UI.Field
        name={name}
        required
        maxLength={80}
        autoComplete={name === "display_name" ? "nickname" : "off"}
      />
    </UI.Label>
  );
}
export function InviteForm({
  kind,
  scopeId,
}: {
  kind: "guardian" | "circle";
  scopeId: string;
}) {
  return (
    <MembershipForm
      command="create-invitation"
      fields={{ kind, scope_id: scopeId }}
      label={
        kind === "guardian"
          ? "Create guardian invitation"
          : "Create circle invitation"
      }
    >
      <UI.Label>
        Recipient email
        <UI.Field
          type="email"
          name="email"
          required
          maxLength={254}
          autoComplete="off"
        />
      </UI.Label>
    </MembershipForm>
  );
}
