import { usePathname } from "expo-router";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Icon } from "@/ui/icon";
import { colors, spacing, styles } from "@/ui/styles";
import { captureFocus, modalFocus } from "@/ui/platform";
export function ActionDialog({
  title,
  children,
  inline = false,
  initialOpen = false,
  tone = "secondary",
  triggerLabel,
  triggerStyle,
}: {
  title: string;
  children: ReactNode;
  inline?: boolean;
  initialOpen?: boolean;
  tone?: "primary" | "secondary";
  triggerLabel?: string;
  triggerStyle?: StyleProp<ViewStyle>;
}) {
  const pathname = usePathname(),
    previousPath = useRef(pathname);

  const [open, setOpen] = useState(initialOpen);
  const [startedInline] = useState(inline);
  const { width } = useWindowDimensions();
  const inset = width <= 650 ? spacing.lg : spacing.xl;
  const id = useId();
  const [restore, setRestore] = useState<() => void>(() => () => {});
  const focusCleanup = useRef<() => void>(() => {});
  useEffect(() => {
    if (previousPath.current !== pathname) {
      setOpen(false);
      previousPath.current = pathname;
    }
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    return () => focusCleanup.current();
  }, [open]);
  function close() {
    setOpen(false);
    restore();
  }
  if (inline || startedInline) return <View>{children}</View>;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={triggerLabel ?? title}
        aria-expanded={open}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          setRestore(() => captureFocus());
          setOpen(true);
        }}
        style={[
          styles.button,
          { marginVertical: spacing.sm },
          tone === "primary" ? styles.primary : undefined,
          title === "Account"
            ? { borderRadius: 24, paddingHorizontal: spacing.md }
            : undefined,
          triggerLabel === "Menu" && styles.iconButton,
          triggerLabel === "Menu" && styles.plainIconButton,
          triggerStyle,
        ]}
      >
        {triggerLabel === "Menu" ? (
          <Icon name="menu" />
        ) : (
          <Text
            style={[
              styles.text,
              styles.buttonText,
              tone === "primary" ? styles.primaryText : undefined,
            ]}
          >
            {triggerLabel ?? title}
          </Text>
        )}
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType={Platform.OS === "web" ? "none" : "fade"}
        onRequestClose={close}
        onShow={() => {
          focusCleanup.current();
          focusCleanup.current = modalFocus(id, close);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{
            flex: 1,
            backgroundColor: "#152e2566",
            justifyContent: "center",
            alignItems: "center",
            padding: width <= 650 ? spacing.md : spacing.xxl,
          }}
        >
          <View
            nativeID={id}
            role="dialog"
            accessibilityLabel={title}
            accessibilityViewIsModal
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: 18,
              width: "100%",
              maxWidth: 600,
              maxHeight: "95%",
              overflow: "hidden",
            }}
            onAccessibilityEscape={close}
          >
            <View
              style={{
                paddingHorizontal: inset,
                paddingVertical: spacing.md,
                borderBottomWidth: 1,
                borderColor: colors.line,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: spacing.md,
              }}
            >
              <Text
                role="heading"
                aria-level={2}
                style={[styles.text, styles.h2, { flex: 1, marginBottom: 0 }]}
              >
                {title}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Close ${title}`}
                onPress={close}
                style={[
                  styles.button,
                  styles.iconButton,
                  { alignSelf: "center" },
                ]}
              >
                <Icon name="close" size={18} />
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: inset }}
            >
              {children}
            </ScrollView>
            <View
              style={{
                paddingHorizontal: inset,
                paddingVertical: spacing.md,
                borderTopWidth: 1,
                borderColor: colors.line,
              }}
            >
              <Pressable
                accessibilityRole="button"
                onPress={close}
                style={[styles.button, { alignSelf: "flex-end" }]}
              >
                <Text style={[styles.text, styles.buttonText]}>Done</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
