import { useEffect } from "react";
import { useAppFonts } from "@/ui/app-fonts";
import { RootNavigation } from "@/ui/root-navigation";
import * as Linking from "expo-linking";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Platform, StyleSheet, Text } from "react-native";
import { SessionProvider } from "@/services/session";
import {
  isInvitationLink,
  rememberInvitation,
} from "@/services/invitation-link";
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
    let active = true;
    let receivedLink = false;
    const remember = (url: string) => {
      if (!isInvitationLink(url)) return;
      receivedLink = true;
      void rememberInvitation(url).catch(() => {});
      consumeFragment();
    };
    if (Platform.OS === "web") return listenFragments(remember);
    void Linking.getInitialURL()
      .then((url) => {
        if (active && !receivedLink && url) remember(url);
      })
      .catch(() => {});
    const listener = Linking.addEventListener("url", ({ url }) =>
      remember(url),
    );
    return () => {
      active = false;
      listener.remove();
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
