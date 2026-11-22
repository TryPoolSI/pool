import { Pressable, Text, View } from "react-native";
import { tap } from "./haptics";
import { colors, compactHeight, radius, styles } from "./styles";

// Use for two to four short, mutually exclusive options. Five or more, or any
// option longer than two words, belongs in a Select.
export function Segmented({
  label,
  options,
  value,
  onChange,
  disabled = false,
  testID,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      role="radiogroup"
      accessibilityLabel={label}
      style={[
        {
          flexDirection: "row",
          backgroundColor: colors.tint,
          borderRadius: radius.md,
          padding: 3,
          gap: 3,
        },
        disabled ? styles.disabled : undefined,
      ]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            role="radio"
            accessibilityLabel={option.label}
            aria-checked={selected}
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            onPress={() => {
              if (selected) return;
              tap();
              onChange(option.value);
            }}
            style={{
              flex: 1,
              minHeight: compactHeight,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 6,
              borderRadius: radius.md - 3,
              backgroundColor: selected ? colors.surface : "transparent",
              boxShadow: selected ? "0 1px 3px rgba(20,41,74,0.14)" : undefined,
            }}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.text,
                {
                  fontSize: 15,
                  lineHeight: 20,
                  fontWeight: selected ? "700" : "500",
                  color: selected ? colors.ink : colors.muted,
                },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
