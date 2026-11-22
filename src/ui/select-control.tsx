import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Icon } from "./icon";
import { colors, radius, shadow, spacing, styles } from "./styles";
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
  const selected = options.find((option) => option.value === value) ?? options[0];
  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: selected?.label }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.field,
          styles.row,
          { justifyContent: "space-between" },
          pressed ? styles.pressed : undefined,
          disabled ? styles.disabled : undefined,
        ]}
      >
        <Text style={styles.text}>{selected?.label}</Text>
        <Icon name="chevron-down" size={18} color={colors.muted} />
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
            backgroundColor: colors.scrim,
          }}
        >
          <Pressable
            accessible={false}
            onPress={() => setOpen(false)}
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
          />
          <View
            accessibilityViewIsModal
            onAccessibilityEscape={() => setOpen(false)}
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              padding: spacing.xl,
              paddingBottom: Math.max(spacing.xl, insets.bottom + spacing.md),
              maxHeight: "80%",
              boxShadow: shadow.float,
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
                    style={({ pressed }) => [
                      styles.row,
                      {
                        minHeight: 52,
                        justifyContent: "space-between",
                        borderBottomWidth: 1,
                        borderColor: colors.line,
                      },
                      pressed ? styles.pressed : undefined,
                    ]}
                  >
                    <Text
                      style={[
                        styles.text,
                        value === o.value ? styles.strong : undefined,
                      ]}
                    >
                      {o.label}
                    </Text>
                    {value === o.value && (
                      <Icon name="check" size={20} color={colors.blue} />
                    )}
                  </Pressable>
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
