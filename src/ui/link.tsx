import { Children, isValidElement, useState } from "react";
import { Link as RouterLink } from "expo-router";
import {
  Pressable,
  Text,
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { ReactNode } from "react";
import {
  colors,
  compactHeight,
  radius,
  spacing,
  styles,
  classStyle,
} from "./styles";
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
  style,
  ...props
}: {
  href: string;
  children?: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  "aria-current"?: string;
  "aria-label"?: string;
  onClick?: () => void;
}) {
  const { width } = useWindowDimensions();
  // expo-router's asChild slot drops function styles, so track the press here.
  const [pressed, setPressed] = useState(false);
  const button = /button/.test(className);
  const primary = /primary/.test(className);
  const textLink = className.includes("text-link");
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
            ? { backgroundColor: colors.skyWash, borderRadius: radius.sm }
            : undefined,
          classStyle(className, width),
          style,
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
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={
          StyleSheet.flatten([
            button
              ? styles.button
              : {
                  minHeight: compactHeight,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: textLink ? 6 : spacing.md,
                  alignSelf: "flex-start",
                  maxWidth: "100%",
                },
            primary ? styles.primary : undefined,
            className.includes("plain")
              ? {
                  borderWidth: 0,
                  backgroundColor: "transparent",
                  alignSelf: "stretch",
                }
              : undefined,
            pressed ? styles.pressed : undefined,
            style,
          ]) as ViewStyle
        }
      >
        {complex ? (
          Children.map(children, (child) =>
            typeof child === "string" || typeof child === "number" ? (
              <Text
                style={[
                  styles.text,
                  button || textLink ? styles.buttonText : undefined,
                  textLink ? { color: colors.blue } : undefined,
                  primary ? styles.primaryText : undefined,
                ]}
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
