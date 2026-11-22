import * as UI from "@/ui/elements";
import { useRef } from "react";
import { CommandForm } from "@/ui/command-form";
import { driverAction } from "@/services/driver-actions";
import { newRequestId } from "@/lib/request-id";
import { styles } from "@/ui/styles";

type OnVehicleSaved = NonNullable<Parameters<typeof driverAction>[2]>;

// One driver decision and one button. Fixed fields carry everything Pool
// already knows, so the form shows only what the person has to choose.
export function DriverForm({
  command,
  fields = {},
  label,
  children,
  onVehicleSaved,
  onResult,
  tone,
  secondary,
  after,
}: {
  command: string;
  fields?: Record<string, string | string[]>;
  label: string;
  children?: React.ReactNode;
  onVehicleSaved?: OnVehicleSaved;
  onResult?: (result: { error?: string }) => void;
  tone?: "danger" | "quiet";
  secondary?: boolean;
  after?: "open" | "close" | "toast" | "inline";
}) {
  const creates =
    command === "proposeDriver" ||
    command === "requestReplacement" ||
    command === "requestRideVehicleChange" ||
    (command === "saveVehicle" && fields.version === "0");
  return (
    <CommandForm
      key={creates ? undefined : String(fields.proposal_id ?? "")}
      action={(values) => driverAction({}, values, onVehicleSaved)}
      fields={{ command, ...fields }}
      label={label}
      creates={creates}
      onResult={onResult}
      tone={tone}
      secondary={secondary}
      after={after}
    >
      {children}
    </CommandForm>
  );
}

// Adding a car never leaves the task: in a sheet it closes and confirms with
// "<name> added"; inline it reports back through onVehicleSaved.
export function AddVehicleForm({
  onVehicleSaved,
  after,
}: {
  onVehicleSaved?: OnVehicleSaved;
  after?: "close" | "toast" | "inline";
}) {
  const id = useRef<string | null>(null);
  return (
    <CommandForm
      action={async (values) => {
        id.current ??= newRequestId();
        const { path: _saved, ...result } = await driverAction(
          {},
          {
            ...values,
            command: "saveVehicle",
            vehicle_id: id.current,
            version: "0",
          },
          onVehicleSaved,
        );
        if (!result.error) id.current = null;
        return result;
      }}
      label="Add car"
      after={after}
      resetOnSuccess
    >
      <VehicleFields />
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
const seatChoices = ["1", "2", "3", "4", "5", "6", "7"].map((value) => ({
  value,
  label: value,
}));
export function VehicleFields({
  label = "",
  seats = 4,
}: {
  label?: string;
  seats?: number;
}) {
  return (
    <>
      <UI.Label>
        Car name
        <UI.Field
          name="label"
          maxLength={80}
          defaultValue={label}
          placeholder="Grey Civic"
          autoComplete="off"
          required
        />
      </UI.Label>
      <UI.Label>
        Seats for passengers
        {seats > seatChoices.length ? (
          // A larger van saved earlier keeps its typed count.
          <UI.Field
            name="passenger_seats"
            type="number"
            min={1}
            max={50}
            step={1}
            defaultValue={seats}
            required
          />
        ) : (
          <UI.Choice
            name="passenger_seats"
            defaultValue={String(seats)}
            options={seatChoices}
          />
        )}
        <UI.Inline style={styles.hint}>Don’t count the driver’s seat.</UI.Inline>
      </UI.Label>
    </>
  );
}
