import { useState } from "react";
import { TextInput, Pressable, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { spacing, styles } from "./styles";
import { keyboardInputProps } from "./keyboard-input";
export type DateProps = {
  testID?: string;
  label: string;
  type: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
};
export function DateControl({
  testID,
  label,
  type,
  value,
  disabled,
  onChange,
}: DateProps) {
  const [mode, setMode] = useState<"date" | "time" | null>(null);
  let wallTime = new Date().toISOString().slice(0, 16);
  if (value) {
    if (type === "time") wallTime = `1970-01-01T${value}`;
    else if (type === "date") wallTime = `${value}T12:00`;
    else wallTime = value;
  }
  const parsed = new Date(`${wallTime}Z`);
  return (
    <View style={{ gap: spacing.sm }}>
      <TextInput
        {...keyboardInputProps}
        testID={testID}
        accessibilityLabel={label}
        placeholder={
          type === "date"
            ? "YYYY-MM-DD"
            : type === "time"
              ? "HH:mm"
              : "YYYY-MM-DDTHH:mm"
        }
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        autoCapitalize="none"
        style={styles.field}
      />
      <View style={styles.actionRow}>
        {type !== "time" && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              type === "date" ? `Choose ${label}` : `Choose ${label} date`
            }
            disabled={disabled}
            onPress={() => setMode("date")}
            style={styles.button}
          >
            <Text style={[styles.text, styles.buttonText]}>Choose date</Text>
          </Pressable>
        )}
        {type !== "date" && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              type === "time" ? `Choose ${label}` : `Choose ${label} time`
            }
            disabled={disabled}
            onPress={() => setMode("time")}
            style={styles.button}
          >
            <Text style={[styles.text, styles.buttonText]}>Choose time</Text>
          </Pressable>
        )}
      </View>
      {mode && (
        <DateTimePicker
          value={Number.isFinite(parsed.getTime()) ? parsed : new Date()}
          mode={mode}
          timeZoneName="UTC"
          onChange={(_, date) => {
            setMode(null);
            if (!date) return;
            const iso = date.toISOString();
            onChange(
              type === "time"
                ? iso.slice(11, 16)
                : iso.slice(0, type === "date" ? 10 : 16),
            );
          }}
        />
      )}
    </View>
  );
}
