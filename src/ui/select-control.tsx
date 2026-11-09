import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { colors, styles } from "./styles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
export type SelectProps = {
  testID?: string;
  label: string;
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  disabled: boolean;
  onChange: (value: string) => void;
};
export function SelectControl({
  testID,
  label,
  value,
  options,
  disabled,
  onChange,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{
          text:
            options.find((o) => o.value === value)?.label ?? options[0]?.label,
        }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={styles.field}
      >
        <Text style={styles.text}>
          {options.find((o) => o.value === value)?.label ?? options[0]?.label} ⌄
        </Text>
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "#152e2566",
          }}
        >
          <View
            accessibilityViewIsModal
            onAccessibilityEscape={() => setOpen(false)}
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              padding: 20,
              paddingBottom: Math.max(20, insets.bottom),
              maxHeight: "80%",
            }}
          >
            <Text
              role="heading"
              aria-level={2}
              style={[styles.text, styles.h2]}
            >
              {label}
            </Text>
            <ScrollView>
              {options
                .filter((o) => !o.disabled)
                .map((o) => (
                  <Pressable
                    key={o.value}
                    accessibilityRole="button"
                    aria-selected={value === o.value}
                    accessibilityState={{ selected: value === o.value }}
                    onPress={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    style={{
                      paddingVertical: 16,
                      borderBottomWidth: 1,
                      borderColor: colors.line,
                    }}
                  >
                    <Text style={styles.text}>
                      {o.label}
                      {value === o.value ? " ✓" : ""}
                    </Text>
                  </Pressable>
                ))}
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              onPress={() => setOpen(false)}
              style={styles.button}
            >
              <Text style={styles.text}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}
