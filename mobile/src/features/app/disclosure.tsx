import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { colors, styles } from "@/ui/styles";
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
      style={{ borderTopWidth: 1, borderColor: colors.line, marginTop: 18 }}
    >
      <Pressable
        testID="disclosure-toggle"
        accessibilityRole="button"
        accessibilityLabel={`${title} details`}
        aria-expanded={expanded}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
        style={{
          minHeight: 44,
          paddingVertical: 12,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text
          style={[
            styles.text,
            { fontSize: 13, fontWeight: "600", color: colors.green },
          ]}
        >
          {title}
        </Text>
        <Text style={styles.text}>{expanded ? "⌃" : "⌄"}</Text>
      </Pressable>
      {expanded && (
        <View style={{ paddingBottom: 12, gap: 8 }}>{children}</View>
      )}
    </View>
  );
}
