import { useEffect } from "react";
import { useAppFonts } from "@/ui/app-fonts";
import { RootNavigation } from "@/ui/root-navigation";
import * as Linking from "expo-linking";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Platform, Text } from "react-native";
import { SessionProvider } from "@/services/session";
import {
  isInvitationLink,
  rememberInvitation,
} from "@/services/invitation-link";
import { consumeFragment, listenFragments } from "@/ui/platform";
import { ToastProvider } from "@/ui/toast";

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
          <ToastProvider>
            <RootNavigation />
          </ToastProvider>
        </SessionProvider>
      )}
    </SafeAreaProvider>
  );
}
