import * as UI from "@/ui/elements";
import { Disclosure } from "./presentation";
import { CommandForm } from "@/ui/command-form";
import { rideAction } from "@/services/ride-actions";
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
      creates={
        command === "createRide" ||
        (command === "saveOwnChild" && fields.revision === "0")
      }
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
          Add a child in child setup before joining a ride.
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
        <UI.Option value="standard">Standard passenger seat</UI.Option>
        <UI.Option value="booster">Booster seat</UI.Option>
        <UI.Option value="child-seat">Child seat</UI.Option>
      </UI.Select>
    </UI.Label>
  );
}
export function LocalTimeField({
  name,
  label,
}: {
  name: string;
  label: string;
}) {
  return (
    <>
      <UI.Label>
        {label}
        <UI.Field type="datetime-local" name={`${name}_local`} required />
      </UI.Label>
      <Disclosure title={`${label}: daylight saving options`}>
        <UI.Paragraph>
          If this hour repeats, choose which occurrence you mean.
        </UI.Paragraph>
        <UI.Label>
          {label} repeated-hour choice
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
