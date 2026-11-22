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
import { colors } from "@/ui/styles";
import { ActionDialog, Avatar } from "../presentation";
import { SeatField } from "../ride-form";

function ChildFields({ child }: { child?: FamilyChild }) {
  return (
    <>
      <UI.Label>
        Name
        <UI.Field
          name="display_name"
          defaultValue={child?.display_name}
          required
          maxLength={80}
          autoComplete="off"
        />
      </UI.Label>
      <SeatField value={child?.seat_requirement} />
    </>
  );
}

function seatLabel(seat: string) {
  const label =
    seatRequirements[seat as keyof typeof seatRequirements] ?? "Standard";
  return label.endsWith("seat") ? label : `${label} seat`;
}

const named = (values: { display_name?: unknown }, fallback: string) =>
  typeof values.display_name === "string" && values.display_name.trim()
    ? values.display_name.trim()
    : fallback;

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
        if (result.error) return result;
        draftId.current = null;
        return { ...result, message: `${named(values, "Child")} added` };
      }}
      label="Add child"
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
        if (result.error) return result;
        revision.current += 1;
        return {
          ...result,
          message: `${named(values, child.display_name)} updated`,
        };
      }}
      label="Save changes"
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
      if (error) throw new Error("Pool couldn’t load your children.");
      return data.sort(compareChildren);
    },
  });
  const empty = roster.data?.length === 0;
  return (
    <UI.Section>
      <UI.Box className="section-head">
        <UI.Heading2 style={{ marginBottom: 0 }}>Children</UI.Heading2>
        {roster.data && (
          <ActionDialog
            title="Add a child"
            tone={empty ? "primary" : "secondary"}
          >
            <AddChildForm familyId={familyId} />
          </ActionDialog>
        )}
      </UI.Box>
      {roster.isPending && <UI.Loading />}
      {roster.isError && (
        <>
          <UI.Paragraph role="alert">
            {roster.data
              ? "Pool can’t refresh your children right now, so this list may be out of date."
              : roster.error.message}
          </UI.Paragraph>
          <UI.Button onPress={() => void roster.refetch()}>Try again</UI.Button>
        </>
      )}
      {empty && (
        <UI.Paragraph style={{ marginVertical: 0 }}>
          Add a child to plan a ride.
        </UI.Paragraph>
      )}
      {roster.data?.map((child) => (
        // Rows, not cards: this list already sits inside the Children card.
        <UI.Box
          className="child-row"
          key={child.id}
          role="group"
          aria-label={child.display_name}
        >
          <Avatar name={child.display_name} />
          <UI.Box style={{ flex: 1 }}>
            <UI.Heading3 style={{ marginTop: 0, marginBottom: 0 }}>
              {child.display_name}
            </UI.Heading3>
            <UI.Small style={{ color: colors.muted }}>
              {seatLabel(child.seat_requirement)}
            </UI.Small>
          </UI.Box>
          <ActionDialog
            title={`Edit ${child.display_name}`}
            triggerLabel="Edit"
            tone="quiet"
          >
            <EditChildForm familyId={familyId} child={child} />
            <UI.Small style={{ color: colors.muted }}>
              Rides you already planned keep the old details until you save
              their riders again.
            </UI.Small>
          </ActionDialog>
        </UI.Box>
      ))}
    </UI.Section>
  );
}
