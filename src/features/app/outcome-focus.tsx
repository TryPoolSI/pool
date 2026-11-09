import { useEffect, useId, useRef, type ReactNode } from "react";
import { AccessibilityInfo, View } from "react-native";
import { followAnchor } from "@/ui/platform";
export function OutcomeFocus({
  state,
  children,
  focusTarget,
}: {
  state: { error?: string; message?: string };
  children: ReactNode;
  focusTarget?: string;
}) {
  const id = useId(),
    previous = useRef("");
  useEffect(() => {
    const message = state.error ?? state.message ?? "";
    if (message && message !== previous.current) {
      AccessibilityInfo.announceForAccessibility(message);
      followAnchor(focusTarget ?? id);
    }
    previous.current = message;
  }, [state.error, state.message, id, focusTarget]);
  return (
    <View
      nativeID={id}
      testID="form-outcome"
      tabIndex={-1}
      accessibilityLiveRegion="polite"
    >
      {children}
    </View>
  );
}
