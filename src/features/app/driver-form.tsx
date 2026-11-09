import * as UI from "@/ui/elements";
import { useState } from "react";
import { CommandForm } from "@/ui/command-form";
import { driverAction } from "@/services/driver-actions";
export function DriverForm({
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
      action={(values) => driverAction({}, values)}
      fields={{ command, ...fields }}
      label={label}
      creates={
        command === "proposeDriver" ||
        command === "requestReplacement" ||
        (command === "saveVehicle" && fields.version === "0")
      }
      resultLabel="Open saved result"
    >
      {children}
    </CommandForm>
  );
}

export function Confirmation({ children }: { children: React.ReactNode }) {
  return (
    <UI.Label className="checkbox-label">
      <UI.Field type="checkbox" name="confirm" value="yes" required />
      {children}
    </UI.Label>
  );
}
export function VehicleFields({
  label = "",
  seats = 1,
}: {
  label?: string;
  seats?: number;
}) {
  return (
    <>
      <UI.Label>
        Vehicle label
        <UI.Field name="label" maxLength={80} defaultValue={label} required />
      </UI.Label>
      <UI.Label>
        Passenger seats, excluding you
        <UI.Field
          name="passenger_seats"
          type="number"
          min={1}
          max={50}
          step={1}
          defaultValue={seats}
          required
        />
      </UI.Label>
    </>
  );
}

export function UTCDeadline({
  value,
  latest,
}: {
  value: string;
  latest: string;
}) {
  const [local, setLocal] = useState(value.slice(0, 19));
  return (
    <UI.Label>
      Review deadline in UTC
      <UI.Field
        type="datetime-local"
        name="deadline_utc"
        step="1"
        required
        value={local}
        max={latest.slice(0, 19)}
        onChange={(event) => setLocal(event.target.value)}
      />
      <UI.Field
        type="hidden"
        name="deadline"
        value={local ? `${local}Z` : ""}
      />
    </UI.Label>
  );
}
