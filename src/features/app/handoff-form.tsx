import { followAnchor } from "@/ui/platform";
import { CommandForm } from "@/ui/command-form";
import { handoffAction } from "@/services/handoff-actions";
export function HandoffForm({
  command,
  fields = {},
  label,
  children,
  secondary = false,
}: {
  command: string;
  fields?: Record<string, string>;
  label: string;
  children?: React.ReactNode;
  secondary?: boolean;
}) {
  return (
    <CommandForm
      action={(values) => handoffAction({}, values)}
      fields={{ command, ...fields }}
      label={label}
      secondary={secondary}
      focusTarget={`journey-${fields.ride_id}-${fields.child_id}`}
      onResult={(result) => {
        if (!result.error)
          setTimeout(
            () => followAnchor(`journey-${fields.ride_id}-${fields.child_id}`),
            0,
          );
      }}
      resultLabel="Open saved result"
    >
      {children}
    </CommandForm>
  );
}
