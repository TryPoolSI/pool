import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { focusManager } from "@tanstack/react-query";
import { queryClient } from "./cache";

// How often an open, visible app re-reads shared data. Rides change when other
// families act, so nobody should need a manual reload to see it.
const liveInterval = 20_000;

function visible() {
  return Platform.OS === "web"
    ? globalThis.document?.visibilityState !== "hidden"
    : AppState.currentState === "active";
}

// Keeps every account query current: refetches when the app returns to the
// foreground and on a short interval while it is visible. Only active queries
// refetch, and a refetch never clears what is on screen.
export function useLiveData() {
  useEffect(() => {
    const refresh = () => {
      if (visible())
        void queryClient.invalidateQueries({
          queryKey: ["account"],
          refetchType: "active",
        });
    };
    const timer = setInterval(refresh, liveInterval);
    const subscription =
      Platform.OS === "web"
        ? undefined
        : AppState.addEventListener("change", (state) => {
            focusManager.setFocused(state === "active");
            if (state === "active") refresh();
          });
    return () => {
      clearInterval(timer);
      subscription?.remove();
    };
  }, []);
}
