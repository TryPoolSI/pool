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
} from "react-native";
import { colors, styles } from "@/ui/styles";
import { captureFocus, modalFocus } from "@/ui/platform";
export function ActionDialog({
  title,
  children,
  inline = false,
  initialOpen = false,
  tone = "secondary",
  triggerLabel,
}: {
  title: string;
  children: ReactNode;
  inline?: boolean;
  initialOpen?: boolean;
  tone?: "primary" | "secondary";
  triggerLabel?: string;
}) {
  const pathname = usePathname(),
    previousPath = useRef(pathname);

  const [open, setOpen] = useState(initialOpen);
  const [startedInline] = useState(inline);
  const { width } = useWindowDimensions();
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
    <View
      style={{ alignSelf: "flex-start", marginVertical: 8, maxWidth: "100%" }}
    >
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
          tone === "primary" ? styles.primary : undefined,
          title === "Account"
            ? { borderRadius: 24, paddingHorizontal: 12 }
            : undefined,
          triggerLabel === "Menu"
            ? {
                width: 44,
                paddingHorizontal: 0,
                borderWidth: 0,
                backgroundColor: "transparent",
              }
            : undefined,
        ]}
      >
        <Text
          style={[
            styles.text,
            styles.buttonText,
            tone === "primary" ? styles.primaryText : undefined,
          ]}
        >
          {triggerLabel === "Menu" ? "☰" : (triggerLabel ?? title)}
        </Text>
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
            padding: width <= 650 ? 10 : 24,
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
                padding: 22,
                borderBottomWidth: 1,
                borderColor: colors.line,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
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
                style={[styles.button, { width: 44, padding: 0 }]}
              >
                <Text style={styles.text}>×</Text>
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: width <= 650 ? 18 : 25 }}
            >
              {children}
            </ScrollView>
            <View
              style={{
                padding: 15,
                borderTopWidth: 1,
                borderColor: colors.line,
                alignItems: "flex-end",
              }}
            >
              <Pressable
                accessibilityRole="button"
                onPress={close}
                style={styles.button}
              >
                <Text style={styles.text}>Done</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
