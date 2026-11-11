import { useEffect } from "react";
import { useAppFonts } from "@/ui/app-fonts";
import { RootNavigation } from "@/ui/root-navigation";
import * as Linking from "expo-linking";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, Text } from "react-native";
import { SessionProvider } from "@/services/session";
import { rememberInvitation } from "@/services/invitation-link";
import { consumeFragment, listenFragments } from "@/ui/platform";
import { colors, styles } from "@/ui/styles";
import appConfig from "../../app.json";

const versionStyles = StyleSheet.create({
  footer: {
    backgroundColor: colors.canvas,
    borderTopWidth: 1,
    borderColor: colors.line,
    paddingVertical: 4,
  },
  label: {
    color: colors.muted,
    textAlign: "center",
  },
});

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
  if (!loaded && !error) return null;
  return (
    <SafeAreaProvider>
      {error ? (
        <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
          <Text>Pool fonts could not be loaded. Reopen the application.</Text>
        </SafeAreaView>
      ) : (
        <SessionProvider>
          <RootNavigation />
        </SessionProvider>
      )}
      <SafeAreaView
        edges={["bottom"]}
        role="contentinfo"
        style={versionStyles.footer}
      >
        <Text style={[styles.text, styles.small, versionStyles.label]}>
          Pool v{appConfig.expo.version}
        </Text>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
