import { useState } from "react";
import * as UI from "@/ui/elements";
import { ActionDialog } from "./presentation";
import { CommandForm } from "@/ui/command-form";
import { rideAction } from "@/services/ride-actions";
import { seatRequirements } from "@/services/family-children";
import { newRequestId } from "@/lib/request-id";
import type { RideState } from "@/lib/rides";
import { spacing } from "@/ui/styles";

export function RideForm({
  command,
  fields = {},
  label,
  children,
  onResult,
  tone,
  after,
}: {
  command: string;
  fields?: Record<string, string>;
  label: string;
  children?: React.ReactNode;
  onResult?: (result: RideState) => void;
  tone?: "danger" | "quiet";
  after?: "open" | "close" | "toast" | "inline";
}) {
  return (
    <CommandForm
      action={(values) => rideAction({}, values)}
      fields={{ command, ...fields }}
      label={label}
      creates={command === "createRide"}
      onResult={onResult}
      tone={tone}
      after={after}
    >
      {children}
    </CommandForm>
  );
}

// The family's own children as tappable rows. With selectOnly, a family with
// one child has that child chosen already, and a child added from this screen
// arrives chosen.
export function ChildChoices({
  children,
  selected = [],
  selectOnly = false,
}: {
  children: { id: string; display_name: string }[];
  selected?: string[];
  selectOnly?: boolean;
}) {
  // The children present when the form first rendered.
  const [initial] = useState(() => new Set(children.map((child) => child.id)));
  return (
    <UI.Fieldset>
      <UI.Legend>Your children</UI.Legend>
      {children.length ? (
        children.map((child) => (
          <UI.Label className="checkbox-label" key={child.id}>
            <UI.Field
              type="checkbox"
              name="child_ids"
              value={child.id}
              defaultChecked={
                selected.includes(child.id) ||
                (selectOnly &&
                  (children.length === 1 || !initial.has(child.id)))
              }
            />
            {child.display_name}
          </UI.Label>
        ))
      ) : (
        <UI.Paragraph style={{ marginVertical: 0 }}>
          Add a child to put them on this ride.
        </UI.Paragraph>
      )}
    </UI.Fieldset>
  );
}

// Adds a child without leaving the task at hand. The list behind the sheet
// refreshes and the sheet closes itself.
export function AddChildSheet({ familyId }: { familyId: string }) {
  // A fresh request id per saved child, so the sheet can be used again.
  const [attempt, setAttempt] = useState(0);
  return (
    <ActionDialog
      title="Add a child"
      tone="quiet"
      triggerStyle={{ paddingHorizontal: 0, alignSelf: "flex-start" }}
    >
      <AddChildForm
        key={attempt}
        familyId={familyId}
        onSaved={() => setAttempt((count) => count + 1)}
      />
    </ActionDialog>
  );
}
function AddChildForm({
  familyId,
  onSaved,
}: {
  familyId: string;
  onSaved: () => void;
}) {
  const [id] = useState(newRequestId);
  return (
    <RideForm
      command="saveOwnChild"
      fields={{ child_id: id, family_id: familyId, revision: "0" }}
      label="Add child"
      onResult={(result) => {
        if (!result.error) onSaved();
      }}
    >
      <UI.Label>
        Name
        <UI.Field
          name="display_name"
          required
          maxLength={80}
          autoComplete="off"
        />
      </UI.Label>
      <SeatField />
    </RideForm>
  );
}

export function SeatField({ value = "standard" }: { value?: string }) {
  return (
    <UI.Label>
      Seat
      <UI.Choice
        name="seat_requirement"
        defaultValue={value}
        options={Object.entries(seatRequirements).map(([seat, label]) => ({
          value: seat,
          label,
        }))}
      />
    </UI.Label>
  );
}

function later(time: string, minutes: number) {
  const [hours, mins] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return "";
  const total = Math.min(hours * 60 + mins + minutes, 23 * 60 + 55);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// One date and two clock times. Drop-off follows pickup by half an hour until
// the person sets it. The timezone is the device's and is never asked for.
export function WhenFields({
  initialDate,
  repeatedHour = false,
}: {
  initialDate: string;
  repeatedHour?: boolean;
}) {
  const [date, setDate] = useState(initialDate);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [endChosen, setEndChosen] = useState(false);
  const [occurrence, setOccurrence] = useState("earlier");
  return (
    <>
      <UI.Label>
        Date
        <UI.Field
          name="date"
          type="date"
          value={date}
          onChange={({ target }) => setDate(target.value)}
          required
        />
      </UI.Label>
      <UI.Box style={{ flexDirection: "row", gap: spacing.md }}>
        <UI.Box style={{ flex: 1 }}>
          <UI.Label>
            Pickup
            <UI.Field
              name="starts_time"
              type="time"
              value={start}
              onChange={({ target }) => {
                setStart(target.value);
                if (!endChosen) setEnd(later(target.value, 30));
              }}
              required
            />
          </UI.Label>
        </UI.Box>
        <UI.Box style={{ flex: 1 }}>
          <UI.Label>
            Drop-off
            <UI.Field
              name="ends_time"
              type="time"
              value={end}
              onChange={({ target }) => {
                setEnd(target.value);
                setEndChosen(true);
              }}
              required
            />
          </UI.Label>
        </UI.Box>
      </UI.Box>
      {repeatedHour && (
        <UI.Label>
          The clocks go back that night. Which one?
          <UI.Choice
            name="start_occurrence"
            value={occurrence}
            onChange={({ target }) => setOccurrence(target.value)}
            options={[
              { value: "earlier", label: "Earlier hour" },
              { value: "later", label: "Later hour" },
            ]}
          />
          <UI.Field type="hidden" name="end_occurrence" value={occurrence} />
        </UI.Label>
      )}
    </>
  );
}
