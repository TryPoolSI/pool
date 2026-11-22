import { useState } from "react";
import { Modal, Platform, Pressable, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "./icon";
import { colors, radius, shadow, spacing, styles } from "./styles";
export type DateProps = {
  testID?: string;
  label: string;
  type: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
};
type Mode = "date" | "time";

// Values are wall-clock strings (YYYY-MM-DD, HH:mm). Parsing and formatting in
// UTC keeps the digits the person picked, whatever the device timezone.
const showDate = new Intl.DateTimeFormat("en", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const showTime = new Intl.DateTimeFormat("en", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

// Nobody types a date. Each part is a field-shaped button that opens the
// system picker: a calendar for dates, a wheel or clock for times.
export function DateControl({
  testID,
  label,
  type,
  value,
  disabled,
  onChange,
}: DateProps) {
  const [mode, setMode] = useState<Mode | null>(null);
  // A date-time reports "" until both parts are chosen; the first part chosen
  // waits here.
  const [draft, setDraft] = useState<{ date?: string; time?: string }>({});
  const insets = useSafeAreaInsets();
  const datePart =
    type === "time"
      ? ""
      : (value.slice(0, 10).match(/^\d{4}-\d\d-\d\d$/)?.[0] ?? draft.date);
  const timePart =
    type === "date"
      ? ""
      : ((type === "time" ? value : value.slice(11, 16)).match(
          /^\d\d:\d\d$/,
        )?.[0] ?? draft.time);
  // Seed an empty picker with the next quarter hour, today (read once).
  const [seed] = useState(() => {
    const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
    now.setUTCMinutes(Math.ceil(now.getUTCMinutes() / 15) * 15, 0, 0);
    return now.toISOString();
  });
  const current = new Date(
    `${datePart || seed.slice(0, 10)}T${timePart || seed.slice(11, 16)}:00Z`,
  );
  function commit(picked: Date, part: Mode) {
    const iso = picked.toISOString();
    const date = part === "date" ? iso.slice(0, 10) : datePart;
    const time = part === "time" ? iso.slice(11, 16) : timePart;
    if (type === "date") onChange(date ?? "");
    else if (type === "time") onChange(time ?? "");
    else {
      setDraft({ date, time });
      onChange(date && time ? `${date}T${time}` : "");
    }
  }
  const part = (kind: Mode, text: string | undefined, placeholder: string) => (
    <Pressable
      testID={
        testID && (type === "datetime-local" ? `${testID}-${kind}` : testID)
      }
      accessibilityRole="button"
      accessibilityLabel={
        type === "datetime-local" ? `${label} ${kind}` : label
      }
      accessibilityValue={{ text: text ?? "Not set" }}
      disabled={disabled}
      onPress={() => setMode(kind)}
      style={({ pressed }) => [
        styles.field,
        styles.row,
        { flex: 1, width: undefined, justifyContent: "space-between" },
        pressed ? styles.pressed : undefined,
        disabled ? styles.disabled : undefined,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.text,
          { flex: 1 },
          text ? undefined : { color: colors.placeholder },
        ]}
      >
        {text ?? placeholder}
      </Text>
      <Icon
        name={kind === "date" ? "calendar" : "clock"}
        size={18}
        color={colors.muted}
      />
    </Pressable>
  );
  const picker = mode && (
    <DateTimePicker
      value={current}
      mode={mode}
      display={
        Platform.OS === "ios"
          ? mode === "date"
            ? "inline"
            : "spinner"
          : "default"
      }
      minuteInterval={5}
      timeZoneName="UTC"
      accentColor={colors.blue}
      themeVariant="light"
      style={{ alignSelf: "center" }}
      onChange={(event, picked) => {
        if (Platform.OS !== "ios") setMode(null);
        if (event.type === "dismissed" || !picked) return;
        commit(picked, mode);
      }}
    />
  );
  return (
    <View style={{ flexDirection: "row", gap: spacing.sm }}>
      {type !== "time" &&
        part(
          "date",
          datePart && showDate.format(new Date(`${datePart}T00:00:00Z`)),
          "Pick a date",
        )}
      {type !== "date" &&
        part(
          "time",
          timePart && showTime.format(new Date(`1970-01-01T${timePart}:00Z`)),
          "Set time",
        )}
      {Platform.OS === "ios" ? (
        <Modal
          visible={Boolean(mode)}
          transparent
          animationType="slide"
          onRequestClose={() => setMode(null)}
        >
          <View
            style={{
              flex: 1,
              justifyContent: "flex-end",
              backgroundColor: colors.scrim,
            }}
          >
            <Pressable
              accessible={false}
              onPress={() => setMode(null)}
              style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
            />
            <View
              accessibilityViewIsModal
              onAccessibilityEscape={() => setMode(null)}
              style={{
                backgroundColor: colors.surface,
                borderTopLeftRadius: radius.xl,
                borderTopRightRadius: radius.xl,
                padding: spacing.xl,
                paddingBottom: Math.max(spacing.xl, insets.bottom + spacing.md),
                gap: spacing.md,
                boxShadow: shadow.float,
              }}
            >
              <Text
                role="heading"
                aria-level={2}
                style={[styles.text, styles.h2, { marginBottom: 0 }]}
              >
                {label}
              </Text>
              {picker}
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  // Accept the shown value even if the wheel was not moved.
                  if (mode) commit(current, mode);
                  setMode(null);
                }}
                style={({ pressed }) => [
                  styles.button,
                  styles.primary,
                  { alignSelf: "stretch" },
                  pressed ? styles.pressed : undefined,
                ]}
              >
                <Text style={[styles.text, styles.buttonText]}>Done</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : (
        picker
      )}
    </View>
  );
}
