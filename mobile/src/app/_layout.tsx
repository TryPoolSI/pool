import { useEffect } from "react";
import { useAppFonts } from "@/ui/app-fonts";
import { RootNavigation } from "@/ui/root-navigation";
import * as Linking from "expo-linking";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Text, View } from "react-native";
import { SessionProvider } from "@/services/session";
import { rememberInvitation } from "@/services/invitation-link";
import { consumeFragment, listenFragments } from "@/ui/platform";
import { styles } from "@/ui/styles";
export default function RootLayout() {
  const [loaded, error] = useAppFonts();
  useEffect(() => {
    const remember = (url: string) => {
      try {
        const parsed = new URL(url, "https://pool.invalid");
        if (parsed.pathname === "/app/invitations" && parsed.hash) {
          void rememberInvitation(url);
          consumeFragment();
        }
      } catch {
        /* Unrecognized links do not alter the pending invitation. */
      }
    };
    void Linking.getInitialURL().then((url) => {
      if (url) remember(url);
    });
    const listener = Linking.addEventListener("url", ({ url }) =>
      remember(url),
    );
    const stop = listenFragments(remember);
    return () => {
      listener.remove();
      stop();
    };
  }, []);
  if (error)
    return (
      <View>
        <Text style={styles.text}>
          Pool fonts could not be loaded. Reopen the application.
        </Text>
      </View>
    );
  if (!loaded) return null;
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <RootNavigation />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
