import { usePathname } from "expo-router";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/ui/icon";
import {
  colors,
  compactHeight,
  radius,
  shadow,
  spacing,
  styles,
} from "@/ui/styles";
import { captureFocus, modalFocus } from "@/ui/platform";

// A form inside a sheet closes it after a successful save (see CommandForm).
const SheetContext = createContext<{ close: () => void } | null>(null);
export function useSheet() {
  return useContext(SheetContext);
}

// The one overlay in Pool. On a phone it is a bottom sheet; from 651px it is a
// centered dialog. It always has a title and a close button, and closes itself
// when the task inside it succeeds.
export function ActionDialog({
  title,
  children,
  inline = false,
  initialOpen = false,
  tone = "secondary",
  triggerLabel,
  triggerStyle,
  trigger,
  compact = false,
}: {
  title: string;
  children: ReactNode;
  inline?: boolean;
  initialOpen?: boolean;
  tone?: "primary" | "secondary" | "quiet" | "danger";
  triggerLabel?: string;
  triggerStyle?: StyleProp<ViewStyle>;
  // Custom trigger content (an avatar, an icon). The accessible name is still
  // triggerLabel or title.
  trigger?: ReactNode;
  // A text-only trigger for actions inside a list row ("Edit", "Remove").
  compact?: boolean;
}) {
  const pathname = usePathname(),
    previousPath = useRef(pathname);
  const [open, setOpen] = useState(initialOpen);
  const [startedInline] = useState(inline);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const phone = width <= 650;
  const inset = phone ? spacing.xl : spacing.xxl;
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
        style={({ pressed }) => [
          trigger
            ? { alignSelf: "flex-start" }
            : compact
              ? [
                  styles.button,
                  styles.quiet,
                  {
                    minHeight: compactHeight,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                  },
                ]
              : [
                  styles.button,
                  tone === "primary" ? styles.primary : undefined,
                  tone === "danger" ? styles.danger : undefined,
                  tone === "quiet" ? styles.quiet : undefined,
                ],
          pressed ? styles.pressed : undefined,
          triggerStyle,
        ]}
      >
        {trigger ?? (
          <Text
            style={[
              styles.text,
              styles.buttonText,
              tone === "primary" ? styles.primaryText : undefined,
              tone === "quiet" || compact ? styles.quietText : undefined,
              tone === "danger" ? styles.dangerText : undefined,
            ]}
          >
            {triggerLabel ?? title}
          </Text>
        )}
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType={phone ? "slide" : "fade"}
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
            backgroundColor: colors.scrim,
            justifyContent: phone ? "flex-end" : "center",
            alignItems: "center",
            padding: phone ? 0 : spacing.xxl,
            paddingTop: phone ? insets.top + spacing.xxl : spacing.xxl,
          }}
        >
          <Pressable
            accessible={false}
            focusable={false}
            tabIndex={-1}
            onPress={close}
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
          />
          <View
            nativeID={id}
            role="dialog"
            aria-modal
            accessibilityLabel={title}
            accessibilityViewIsModal
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              borderBottomLeftRadius: phone ? 0 : radius.xl,
              borderBottomRightRadius: phone ? 0 : radius.xl,
              width: "100%",
              maxWidth: phone ? undefined : 520,
              maxHeight: "100%",
              overflow: "hidden",
              boxShadow: shadow.float,
            }}
            onAccessibilityEscape={close}
          >
            {phone && (
              <View
                aria-hidden
                style={{
                  alignSelf: "center",
                  width: 36,
                  height: 5,
                  borderRadius: radius.full,
                  backgroundColor: colors.line,
                  marginTop: spacing.sm,
                }}
              />
            )}
            <View
              style={{
                paddingLeft: inset,
                paddingRight: spacing.md,
                paddingTop: phone ? spacing.sm : spacing.lg,
                paddingBottom: spacing.sm,
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
                style={({ pressed }) => [
                  styles.button,
                  styles.iconButton,
                  { alignSelf: "center", backgroundColor: colors.tint },
                  styles.plainIconButton,
                  { backgroundColor: colors.tint },
                  pressed ? styles.pressed : undefined,
                ]}
              >
                <Icon name="close" size={18} />
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingHorizontal: inset,
                paddingTop: spacing.xs,
                paddingBottom: Math.max(inset, insets.bottom + spacing.md),
              }}
            >
              <SheetContext.Provider value={{ close }}>
                {children}
              </SheetContext.Provider>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
