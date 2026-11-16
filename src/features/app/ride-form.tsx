import { useState } from "react";
import * as UI from "@/ui/elements";
import { Disclosure } from "./presentation";
import { CommandForm } from "@/ui/command-form";
import { rideAction } from "@/services/ride-actions";
import { seatRequirements } from "@/services/family-children";
export function RideForm({
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
      action={(values) => rideAction({}, values)}
      fields={{ command, ...fields }}
      label={label}
      creates={command === "createRide"}
      resultLabel="Open saved result"
    >
      {children}
    </CommandForm>
  );
}

export function ChildChoices({
  children,
  selected = [],
}: {
  children: { id: string; display_name: string }[];
  selected?: string[];
}) {
  return (
    <UI.Fieldset>
      <UI.Legend>Your family’s riders</UI.Legend>
      {children.length ? (
        children.map((child) => (
          <UI.Label className="checkbox-label" key={child.id}>
            <UI.Field
              type="checkbox"
              name="child_ids"
              value={child.id}
              defaultChecked={selected.includes(child.id)}
            />
            {child.display_name}
          </UI.Label>
        ))
      ) : (
        <UI.Paragraph>
          Add a child in My family before joining a ride.
        </UI.Paragraph>
      )}
    </UI.Fieldset>
  );
}
export function SeatField({ value = "standard" }: { value?: string }) {
  return (
    <UI.Label>
      Seat requirement
      <UI.Select name="seat_requirement" defaultValue={value} required>
        {Object.entries(seatRequirements).map(([seat, label]) => (
          <UI.Option key={seat} value={seat}>
            {label}
          </UI.Option>
        ))}
      </UI.Select>
    </UI.Label>
  );
}
function ScheduledTimeFields({
  name,
  label,
  initialDate,
}: {
  name: string;
  label: string;
  initialDate: string;
}) {
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState("");
  return (
    <>
      <UI.Label>
        {label} date
        <UI.Field
          name={`${name}_date`}
          type="date"
          value={date}
          onChange={({ target }) => setDate(target.value)}
          required
        />
      </UI.Label>
      <UI.Label>
        {label} time
        <UI.Field
          name={`${name}_time`}
          type="time"
          value={time}
          onChange={({ target }) => setTime(target.value)}
          required
        />
      </UI.Label>
      <UI.Field
        name={`${name}_local`}
        type="hidden"
        value={date && time ? `${date}T${time}` : ""}
      />
    </>
  );
}

export function LocalTimeField({
  name,
  label,
  initialDate,
}: {
  name: string;
  label: string;
  initialDate?: string;
}) {
  return (
    <>
      {initialDate ? (
        <ScheduledTimeFields
          name={name}
          label={label}
          initialDate={initialDate}
        />
      ) : (
        <UI.Label>
          {label} time
          <UI.Field type="datetime-local" name={`${name}_local`} required />
        </UI.Label>
      )}
      <Disclosure title={`${label} time: daylight saving options`}>
        <UI.Paragraph>
          If this hour repeats, choose which occurrence you mean.
        </UI.Paragraph>
        <UI.Label>
          {label} time repeated-hour choice
          <UI.Select
            name={name === "starts" ? "start_occurrence" : "end_occurrence"}
            defaultValue="reject"
          >
            <UI.Option value="reject">Ask me if the hour repeats</UI.Option>
            <UI.Option value="earlier">Earlier occurrence</UI.Option>
            <UI.Option value="later">Later occurrence</UI.Option>
          </UI.Select>
        </UI.Label>
      </Disclosure>
    </>
  );
}
