import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { newRequestId } from "@/lib/request-id";
import { createClient } from "@/lib/supabase/client";
import {
  compareChildren,
  familyChildrenKey,
  seatRequirements,
  type FamilyChild,
} from "@/services/family-children";
import { rideAction } from "@/services/ride-actions";
import { CommandForm } from "@/ui/command-form";
import * as UI from "@/ui/elements";
import { ActionDialog, Avatar } from "../presentation";
import { SeatField } from "../ride-form";

function ChildFields({ child }: { child?: FamilyChild }) {
  return (
    <>
      <UI.Label>
        Child display name
        <UI.Field
          name="display_name"
          defaultValue={child?.display_name}
          required
          maxLength={80}
        />
      </UI.Label>
      <SeatField value={child?.seat_requirement} />
    </>
  );
}

function AddChildForm({ familyId }: { familyId: string }) {
  const draftId = useRef<string | null>(null);
  return (
    <CommandForm
      action={async (values) => {
        draftId.current ??= newRequestId();
        const result = await rideAction(
          {},
          {
            ...values,
            command: "saveOwnChild",
            family_id: familyId,
            child_id: draftId.current,
            revision: "0",
          },
        );
        if (!result.error) draftId.current = null;
        return result;
      }}
      label="Save child"
      resetOnSuccess
    >
      <ChildFields />
    </CommandForm>
  );
}

function EditChildForm({
  familyId,
  child,
}: {
  familyId: string;
  child: FamilyChild;
}) {
  const revision = useRef(child.revision);
  return (
    <CommandForm
      action={async (values) => {
        const result = await rideAction(
          {},
          {
            ...values,
            command: "saveOwnChild",
            family_id: familyId,
            child_id: child.id,
            revision: String(revision.current),
          },
        );
        if (!result.error) revision.current += 1;
        return result;
      }}
      label="Update child"
    >
      <ChildFields child={child} />
    </CommandForm>
  );
}

export function FamilyChildren({
  userId,
  familyId,
}: {
  userId: string;
  familyId: string;
}) {
  const roster = useQuery({
    queryKey: familyChildrenKey(userId, familyId),
    queryFn: async ({ signal }) => {
      const { data, error } = await createClient()
        .from("children")
        .select("id,display_name,seat_requirement,revision")
        .eq("family_id", familyId)
        .abortSignal(signal);
      if (error) throw new Error("The child roster could not be loaded.");
      return data.sort(compareChildren);
    },
  });
  return (
    <UI.Section>
      <UI.Heading2>Children</UI.Heading2>
      {roster.isPending && (
        <UI.Paragraph role="status">Loading children…</UI.Paragraph>
      )}
      {roster.isError && (
        <>
          <UI.Paragraph role="alert">
            {roster.data
              ? "The child roster could not be refreshed."
              : roster.error.message}
          </UI.Paragraph>
          <UI.Button onPress={() => void roster.refetch()}>
            Retry child roster
          </UI.Button>
        </>
      )}
      {roster.data && (
        <>
          <UI.Heading3>Add a child</UI.Heading3>
          <AddChildForm familyId={familyId} />
          {roster.data.length ? (
            <UI.Box className="people-grid">
              {roster.data.map((child) => (
                <UI.Section
                  className="person-card"
                  key={child.id}
                  role="group"
                  aria-label={child.display_name}
                >
                  <Avatar name={child.display_name} />
                  <UI.Heading3>{child.display_name}</UI.Heading3>
                  <UI.Paragraph>
                    {seatRequirements[
                      child.seat_requirement as keyof typeof seatRequirements
                    ]}
                  </UI.Paragraph>
                  <ActionDialog title={`Edit ${child.display_name}`}>
                    <UI.Paragraph>
                      Changes apply to future enrollment. Re-save riders on an
                      existing ride to update its details.
                    </UI.Paragraph>
                    <EditChildForm familyId={familyId} child={child} />
                  </ActionDialog>
                </UI.Section>
              ))}
            </UI.Box>
          ) : (
            <UI.Paragraph>No children saved for this family.</UI.Paragraph>
          )}
        </>
      )}
    </UI.Section>
  );
}
