import { useRef, useState } from "react";
import { View } from "react-native";
import { spacing } from "@/ui/styles";
import { followAnchor } from "@/ui/platform";
import { CommandForm } from "@/ui/command-form";
import { newRequestId } from "@/lib/request-id";
import { handoffAction } from "@/services/handoff-actions";

export type HandoffCommand =
  "designateRecipient" | "recordPickup" | "reportArrival" | "confirmHandoff";
type Emphasis = "primary" | "secondary" | "quiet";

// The heading a child's row is focused on after a step is saved.
export const childRowId = (rideId: string, childId: string) =>
  `journey-${rideId}-${childId}`;

// A step is one button inside a card that already spaces its rows. This takes
// back the margin a form adds around itself, and leaves room for its error.
export const stepSpacing = {
  marginTop: -spacing.md,
  marginBottom: -(spacing.md + spacing.sm),
};

export function nameList(list: string[]) {
  if (list.length < 3) return list.join(" and ");
  return `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
}

// One step of a child's trip as one button: "Picked up Leo", "Arrived with
// Leo", "I have Leo", or saving who meets them. Pressing it is the
// confirmation, so there is nothing to tick first.
export function HandoffForm({
  command,
  fields,
  label,
  children,
  emphasis = "primary",
}: {
  command: HandoffCommand;
  fields: Record<string, string>;
  label: string;
  children?: React.ReactNode;
  emphasis?: Emphasis;
}) {
  // One id per mounted step, so a retry repeats the same request.
  const [requestId] = useState(newRequestId);
  const target = childRowId(fields.ride_id, fields.child_id);
  return (
    <View style={stepSpacing}>
      <CommandForm
        action={(values) => handoffAction({}, values)}
        fields={{ command, confirm: "yes", request_id: requestId, ...fields }}
        label={label}
        secondary={emphasis === "secondary"}
        tone={emphasis === "quiet" ? "quiet" : undefined}
        // The row changes after success, so the confirmation is a toast.
        after="toast"
        focusTarget={target}
        onResult={(result) => {
          if (!result.error) setTimeout(() => followAnchor(target), 0);
        }}
      >
        {children}
      </CommandForm>
    </View>
  );
}

// The same step for several children with one press ("Picked up everyone").
// Each child is saved in turn; the first one that fails stops the run and says
// who is already saved.
export function HandoffAllForm({
  command,
  rideId,
  revision,
  items,
  extra = {},
  label,
  emphasis = "primary",
}: {
  command: HandoffCommand;
  rideId: string;
  revision: string;
  items: { child_id: string; version: number; name: string }[];
  extra?: Record<string, string>;
  label: string;
  emphasis?: Emphasis;
}) {
  const requests = useRef<Record<string, string>>({});
  return (
    <View style={stepSpacing}>
      <CommandForm
        action={async () => {
          const saved: string[] = [];
          let message = "Saved";
          for (const item of items) {
            requests.current[item.child_id] ??= newRequestId();
            const result = await handoffAction(
              {},
              {
                ...extra,
                command,
                confirm: "yes",
                ride_id: rideId,
                child_id: item.child_id,
                revision,
                version: String(item.version),
                request_id: requests.current[item.child_id],
              },
            );
            if (result.error)
              return {
                error: saved.length
                  ? `Saved for ${nameList(saved)}, but not for ${item.name}. ${result.error}`
                  : result.error,
              };
            saved.push(item.name);
            message = result.message ?? message;
          }
          return { message };
        }}
        label={label}
        secondary={emphasis === "secondary"}
        tone={emphasis === "quiet" ? "quiet" : undefined}
        after="toast"
      />
    </View>
  );
}
