import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Icon } from "@/ui/icon";
import { colors, controlHeight, spacing, styles } from "@/ui/styles";
export function Disclosure({
  title,
  children,
  open = false,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  const [expanded, setExpanded] = useState(open);
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderColor: colors.line,
        marginTop: spacing.lg,
      }}
    >
      <Pressable
        testID="disclosure-toggle"
        accessibilityRole="button"
        accessibilityLabel={title}
        aria-expanded={expanded}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
        style={{
          minHeight: controlHeight,
          paddingVertical: spacing.sm,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: spacing.md,
        }}
      >
        <Text
          style={[
            styles.text,
            { fontSize: 15, fontWeight: "600", color: colors.blue },
          ]}
        >
          {title}
        </Text>
        <Icon
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={colors.blue}
        />
      </Pressable>
      {expanded && (
        <View style={{ paddingBottom: spacing.md, gap: spacing.sm }}>
          {children}
        </View>
      )}
    </View>
  );
}
