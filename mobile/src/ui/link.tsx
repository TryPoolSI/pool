import { Children, isValidElement } from "react";
import { Link as RouterLink } from "expo-router";
import { Pressable, Text, StyleSheet, useWindowDimensions } from "react-native";
import type { ReactNode } from "react";
import { colors, styles, classStyle } from "./styles";
function linkLabel(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : isValidElement<{
              children?: ReactNode;
              "aria-hidden"?: boolean | string;
            }>(child) && !child.props["aria-hidden"]
          ? linkLabel(child.props.children)
          : "",
    )
    .join("")
    .trim();
}
export default function Link({
  href,
  children,
  className = "",
  ...props
}: {
  href: string;
  children?: ReactNode;
  className?: string;
  "aria-current"?: string;
  "aria-label"?: string;
  onClick?: () => void;
}) {
  const { width } = useWindowDimensions();
  const button = /button/.test(className);
  const primary = /primary/.test(className);
  const complex = Children.toArray(children).some(isValidElement);
  if (!button && !complex)
    return (
      <RouterLink
        href={href as never}
        accessibilityLabel={props["aria-label"] ?? linkLabel(children)}
        aria-current={props["aria-current"] as never}
        onPress={props.onClick}
        style={[
          styles.text,
          styles.link,
          props["aria-current"]
            ? { backgroundColor: colors.lime, borderRadius: 9 }
            : undefined,
          classStyle(className, width),
        ]}
      >
        {children}
      </RouterLink>
    );
  return (
    <RouterLink href={href as never} asChild>
      <Pressable
        aria-current={props["aria-current"] as never}
        accessibilityRole="link"
        accessibilityLabel={props["aria-label"] ?? linkLabel(children)}
        onPress={props.onClick}
        style={StyleSheet.flatten([
          button
            ? styles.button
            : {
                minHeight: 44,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                alignSelf: "flex-start",
                maxWidth: "100%",
              },
          className.includes("mobile-tab")
            ? { flex: 1, paddingHorizontal: 3 }
            : undefined,
          primary ? styles.primary : undefined,
          className.includes("plain")
            ? {
                borderWidth: 0,
                backgroundColor: "transparent",
                alignSelf: "stretch",
              }
            : undefined,
          props["aria-current"] && !className.includes("mobile-tab")
            ? { backgroundColor: colors.lime }
            : undefined,
        ])}
      >
        {complex ? (
          Children.map(children, (child) =>
            typeof child === "string" || typeof child === "number" ? (
              <Text
                style={[styles.text, primary ? styles.primaryText : undefined]}
              >
                {child}
              </Text>
            ) : (
              child
            ),
          )
        ) : (
          <Text
            style={[
              styles.text,
              styles.buttonText,
              primary ? styles.primaryText : undefined,
            ]}
          >
            {children}
          </Text>
        )}
      </Pressable>
    </RouterLink>
  );
}
