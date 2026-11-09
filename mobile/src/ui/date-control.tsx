import { useState } from "react";
import { TextInput, Pressable, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { styles } from "./styles";
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
  const wallTime = value
    ? value.includes("T")
      ? value
      : `${value}T12:00`
    : new Date().toISOString().slice(0, 16);
  const parsed = new Date(`${wallTime}Z`);
  return (
    <View style={{ gap: 8 }}>
      <TextInput
        {...keyboardInputProps}
        testID={testID}
        accessibilityLabel={label}
        placeholder={type === "date" ? "YYYY-MM-DD" : "YYYY-MM-DDTHH:mm"}
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        autoCapitalize="none"
        style={styles.field}
      />
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Choose ${label} date`}
          disabled={disabled}
          onPress={() => setMode("date")}
          style={styles.button}
        >
          <Text style={styles.text}>Choose date</Text>
        </Pressable>
        {type !== "date" && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Choose ${label} time`}
            disabled={disabled}
            onPress={() => setMode("time")}
            style={styles.button}
          >
            <Text style={styles.text}>Choose time</Text>
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
            if (date)
              onChange(date.toISOString().slice(0, type === "date" ? 10 : 16));
          }}
        />
      )}
    </View>
  );
}
