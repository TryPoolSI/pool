import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AccessibilityInfo, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "@/services/session";
import { Glass } from "./glass";
import { Icon } from "./icon";
import { success as successHaptic } from "./haptics";
import { colors, radius, spacing, styles } from "./styles";

// One confirmation at a time, shown after an action succeeds and the person is
// already back on their task. Errors never use a toast: they stay beside the
// control that failed, with the input intact.
// `session` ties a toast to the account that earned it: it never outlives a
// sign-out.
type Toast = { id: number; message: string; session: string | null };
const ToastContext = createContext<(message: string) => void>(() => {});
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const session = user?.id ?? null;
  const show = useCallback(
    (message: string) => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ id: Date.now(), message, session });
      AccessibilityInfo.announceForAccessibility(message);
      successHaptic();
      timer.current = setTimeout(() => setToast(null), 4000);
    },
    [session],
  );
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const value = useMemo(() => show, [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          // Above the phone tab bar, clear of the page title.
          bottom: insets.bottom + 92,
          left: spacing.lg,
          right: spacing.lg,
          alignItems: "center",
          zIndex: 100,
        }}
      >
        {toast && toast.session === session && (
          <Glass
            key={toast.id}
            testID="toast"
            style={{
              borderRadius: radius.full,
              maxWidth: 480,
              overflow: "hidden",
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${toast.message}. Dismiss`}
              onPress={() => setToast(null)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                minHeight: 44,
                paddingVertical: 10,
                paddingLeft: spacing.md,
                paddingRight: spacing.lg,
              }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: radius.full,
                  backgroundColor: colors.sky,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="check" size={14} color={colors.ink} />
              </View>
              <Text
                role="status"
                aria-live="polite"
                style={[styles.text, { fontSize: 15, fontWeight: "600" }]}
              >
                {toast.message}
              </Text>
            </Pressable>
          </Glass>
        )}
      </View>
    </ToastContext.Provider>
  );
}
