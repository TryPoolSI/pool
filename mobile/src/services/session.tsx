import NetInfo from "@react-native-community/netinfo";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, Platform } from "react-native";
import { usePathname } from "expo-router";
import {
  focusManager,
  onlineManager,
  QueryClientProvider,
} from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { verifiedUser } from "@/lib/auth/identity";
import { queryClient } from "./cache";
import { sessionEndReason, type SessionEndReason } from "./session-end";
type SessionState = {
  user: User | null;
  ready: boolean;
  ended?: SessionEndReason;
  error?: string;
  retry: () => void;
};
const Session = createContext<SessionState>({
  user: null,
  ready: false,
  retry: () => {},
});
export const useSession = () => useContext(Session);
export function SessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const completedEnd = useRef<SessionEndReason | undefined>(undefined);
  const verifier = useRef<() => Promise<void>>(async () => {});
  const retry = useCallback(() => {
    void verifier.current();
  }, []);
  const [state, setState] = useState<Omit<SessionState, "retry">>({
    user: null,
    ready: false,
  });
  const [previousPath, setPreviousPath] = useState(pathname);
  // A completed redirect is one-time UI state. Reset it before rendering a
  // public route so a later protected link keeps its own return destination.
  if (previousPath !== pathname) {
    setPreviousPath(pathname);
    if (!pathname.startsWith("/app") && state.ended)
      setState({ ...state, ended: undefined });
  }
  useEffect(() => {
    const client = createClient();
    let alive = true;
    let revision = 0;
    let account: string | null = null;
    async function verify() {
      const current = ++revision;
      let user: User | null;
      try {
        user = await verifiedUser(client);
      } catch {
        if (!alive || current !== revision) return;
        await queryClient.cancelQueries();
        if (!alive || current !== revision) return;
        queryClient.clear();
        account = null;
        setState((previous) => ({
          ...previous,
          user: null,
          ready: true,
          error:
            "Your saved session could not be read or verified. Try again. If this continues, restart Pool and check your connection.",
        }));
        return;
      }
      if (!alive || current !== revision) return;
      if (account !== (user?.id ?? null)) {
        await queryClient.cancelQueries();
        queryClient.clear();
        account = user?.id ?? null;
      }
      if (user) completedEnd.current = undefined;
      if (alive && current === revision)
        setState((previous) => ({
          ...previous,
          user,
          ready: true,
          error: undefined,
          ended: completedEnd.current,
        }));
    }
    verifier.current = verify;
    void verify();
    const { data } = client.auth.onAuthStateChange((event, session) => {
      // Capture the completed explicit action while Supabase emits SIGNED_OUT.
      // The command and protected route must agree on the final destination.
      if (event === "SIGNED_OUT") completedEnd.current = sessionEndReason();
      // Supabase repeats SIGNED_IN on foreground. Keep the verified account's
      // mounted forms while rechecking; only an identity change hides them.
      // Session payloads never grant authority: verify() still calls getUser().
      if (event === "SIGNED_OUT" || (session?.user.id ?? null) !== account) {
        revision++;
        setState((current) => ({ ...current, ready: false }));
      }
      setTimeout(() => {
        if (alive) void verify();
      }, 0);
    });
    const stopNetwork = NetInfo.addEventListener((state) =>
      onlineManager.setOnline(
        state.isConnected !== false && state.isInternetReachable !== false,
      ),
    );
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        client.auth.startAutoRefresh();
        focusManager.setFocused(true);
        void verify();
      } else {
        client.auth.stopAutoRefresh();
        focusManager.setFocused(false);
      }
    });
    if (Platform.OS !== "web" && AppState.currentState !== "active")
      client.auth.stopAutoRefresh();
    return () => {
      alive = false;
      verifier.current = async () => {};
      data.subscription.unsubscribe();
      subscription.remove();
      stopNetwork();
    };
  }, []);
  useEffect(() => {
    if (!pathname.startsWith("/app")) {
      completedEnd.current = undefined;
    }
  }, [pathname]);
  return (
    <QueryClientProvider client={queryClient}>
      <Session.Provider value={{ ...state, retry }}>
        {children}
      </Session.Provider>
    </QueryClientProvider>
  );
}
