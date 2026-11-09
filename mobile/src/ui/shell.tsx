import { TypographyScale } from "./elements";
import { SkipLink } from "./web-accessibility";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ScrollView,
  View,
  Text,
  Pressable,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  type ScrollViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/services/session";
import { queryClient } from "@/services/cache";
import { Brand, Icon, Avatar } from "@/features/app/presentation";
import { AuthForm } from "@/features/auth/auth-form";
import { ActionDialog } from "@/features/app/action-dialog";
import Link from "./link";
import { colors, styles } from "./styles";
const destinations = [
  ["/app/attention", "Today", "home"],
  ["/app/schedule", "Schedule", "calendar"],
  ["/app", "My circle", "users"],
  ["/app/driving", "Driving", "activity"],
];
const setup = [
  ["/app/children", "Children", "users"],
  ["/app/vehicles", "Vehicles", "car"],
  ["/app/invitations", "Invitations", "shield"],
];
function NavigationLinks({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  return (
    <View
      role="navigation"
      accessibilityLabel={mobile ? "Phone navigation" : "Application"}
      style={{ flexDirection: mobile ? "row" : "column", gap: 7 }}
    >
      {destinations.map(([href, label, icon]) => {
        const current =
          pathname === href ||
          (href === "/app" && /\/app\/(families|circles)/.test(pathname));
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={mobile ? "button plain mobile-tab" : "button plain"}
          >
            <View
              style={{
                flexDirection: mobile ? "column" : "row",
                alignItems: "center",
                gap: mobile ? 4 : 13,
                minWidth: 0,
              }}
            >
              <Icon name={icon} />
              <Text
                style={[
                  styles.text,
                  {
                    fontSize: mobile ? 12 : 14,
                    color: current ? colors.green : colors.muted,
                    fontWeight: current ? "700" : "400",
                  },
                ]}
              >
                {label}
              </Text>
            </View>
          </Link>
        );
      })}
    </View>
  );
}
export function ApplicationShell({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions(),
    mobile = width <= 650,
    insets = useSafeAreaInsets(),
    { user } = useSession(),
    pathname = usePathname();
  const [refreshing, setRefreshing] = useState(false);
  const content = useRef<ScrollViewInstance>(null);
  useEffect(() => {
    content.current?.scrollTo({ y: 0, animated: false });
  }, [pathname]);
  const context = useQuery({
    queryKey: ["account", user?.id, "shell"],
    enabled: Boolean(user),
    queryFn: async () => {
      const client = createClient();
      const [profile, circles] = await Promise.all([
        client
          .from("profiles")
          .select("display_name")
          .eq("id", user!.id)
          .maybeSingle(),
        client.from("circles").select("name").order("name").limit(2),
      ]);
      if (profile.error || circles.error)
        throw new Error("Account context could not be loaded");
      return {
        name: profile.data?.display_name || "Your account",
        circle:
          circles.data.length === 1 ? circles.data[0].name : "Your circles",
      };
    },
  });
  const sidebar = width > 1200 ? 232 : width > 900 ? 205 : 190;
  const label =
    destinations.find((d) => d[0] === pathname)?.[1] ||
    setup.find((d) => d[0] === pathname)?.[1] ||
    (pathname.endsWith("/new") ? "Plan a ride" : "Ride details");
  const setupLinks = (
    <View
      style={{
        gap: 7,
        marginTop: 24,
        paddingTop: 18,
        borderTopWidth: 1,
        borderColor: colors.line,
      }}
    >
      {setup.map(([href, label, icon]) => (
        <Link
          key={href}
          href={href}
          className="button plain"
          aria-current={pathname === href ? "page" : undefined}
        >
          <Icon name={icon} />
          <Text
            style={[
              styles.text,
              {
                fontSize: 14,
                color: pathname === href ? colors.green : colors.muted,
                fontWeight: pathname === href ? "700" : "400",
              },
            ]}
          >
            {label}
          </Text>
        </Link>
      ))}
    </View>
  );
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.canvas,
        paddingTop: insets.top,
      }}
    >
      <SkipLink />
      <View style={{ flex: 1, flexDirection: "row" }}>
        {!mobile && (
          <ScrollView
            style={{
              width: sidebar,
              maxWidth: sidebar,
              backgroundColor: colors.sidebar,
              borderRightWidth: 1,
              borderColor: colors.line,
            }}
            contentContainerStyle={{
              paddingVertical: 32,
              paddingHorizontal: 22,
              gap: 22,
              flexGrow: 1,
            }}
          >
            <Link href="/app/attention" aria-label="Pool home">
              <Brand />
            </Link>
            <View
              style={{
                padding: 14,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: 12,
              }}
            >
              <View
                style={{ flexDirection: "row", gap: 11, alignItems: "center" }}
              >
                <View
                  style={{
                    backgroundColor: colors.lime,
                    borderRadius: 18,
                    width: 36,
                    height: 36,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="shield" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.text, { fontWeight: "700", fontSize: 14 }]}
                  >
                    {context.data?.circle ?? "Your circles"}
                  </Text>
                  <Text style={[styles.text, styles.small]}>
                    Share the driving
                  </Text>
                </View>
              </View>
            </View>
            <NavigationLinks />
            {setupLinks}
            <Text
              style={[
                styles.text,
                {
                  color: colors.green,
                  marginTop: "auto",
                  paddingTop: 30,
                  paddingBottom: 24,
                  borderBottomWidth: 1,
                  borderColor: colors.line,
                },
              ]}
            >
              A little coordination.{"\n"}A lot of peace of mind.
            </Text>
            <Link href="/app/rides/new">＋ Plan a ride</Link>
          </ScrollView>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View
            style={{
              minHeight: mobile ? 70 : 85,
              paddingHorizontal: mobile ? 18 : 40,
              borderBottomWidth: 1,
              borderColor: colors.line,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            {Platform.OS !== "web" &&
              /^\/app\/(families|circles|rides)\//.test(pathname) && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                  onPress={() =>
                    router.canGoBack()
                      ? router.back()
                      : router.replace("/app/attention")
                  }
                  style={[
                    styles.button,
                    {
                      width: 44,
                      padding: 0,
                      borderWidth: 0,
                      backgroundColor: "transparent",
                    },
                  ]}
                >
                  <Text style={[styles.text, { fontSize: 26 }]}>‹</Text>
                </Pressable>
              )}
            <Text
              style={[
                styles.text,
                { fontSize: 12, color: colors.muted, flex: 1 },
              ]}
            >
              Your family / {label}
            </Text>
            {!mobile && <Avatar name={context.data?.name ?? "Your account"} />}
            {width > 1200 && (
              <Text style={[styles.text, { fontSize: 12 }]}>
                {context.data?.name ?? "Your account"}
              </Text>
            )}
            <ActionDialog title="Account">
              <Text style={styles.text}>{user?.email}</Text>
              <AuthForm mode="sign-out" />
            </ActionDialog>
            {mobile && (
              <ActionDialog title="Your Pool" triggerLabel="Menu">
                <NavigationLinks />
                {setupLinks}
                <Link href="/app/rides/new">＋ Plan a ride</Link>
              </ActionDialog>
            )}
          </View>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
          >
            <ScrollView
              ref={content}
              keyboardDismissMode={Platform.OS === "web" ? "none" : "on-drag"}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                Platform.OS === "web" ? undefined : (
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={async () => {
                      setRefreshing(true);
                      await queryClient.invalidateQueries({
                        queryKey: ["account"],
                      });
                      setRefreshing(false);
                    }}
                  />
                )
              }
              contentContainerStyle={{
                flexGrow: 1,
                paddingHorizontal: mobile ? 18 : width <= 1200 ? 25 : 40,
                paddingTop: mobile ? 27 : 38,
                paddingBottom: 24,
              }}
            >
              <View
                nativeID="main-content"
                role="main"
                tabIndex={-1}
                style={{
                  width: "100%",
                  maxWidth: 1352,
                  alignSelf: "center",
                  flex: 1,
                }}
              >
                {children}
                <View style={{ marginTop: 24 }}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      queryClient.invalidateQueries({ queryKey: ["account"] })
                    }
                    style={styles.button}
                  >
                    <Text style={styles.text}>Refresh current data</Text>
                  </Pressable>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 13,
                    marginTop: 40,
                    paddingVertical: 25,
                    borderTopWidth: 1,
                    borderColor: colors.line,
                  }}
                >
                  <Text
                    style={[
                      styles.text,
                      {
                        fontFamily: "Manrope",
                        fontSize: 24,
                        fontWeight: "800",
                      },
                    ]}
                  >
                    pool.
                  </Text>
                  <Text
                    style={[styles.text, { fontSize: 12, color: colors.muted }]}
                  >
                    A smoother ride for every family.
                  </Text>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </View>
      {mobile && (
        <View
          style={{
            borderTopWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.surface,
            paddingTop: 8,
            paddingHorizontal: 8,
            paddingBottom: Math.max(10, insets.bottom),
          }}
        >
          <NavigationLinks mobile />
        </View>
      )}
    </View>
  );
}
export function AuthShell({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardDismissMode={Platform.OS === "web" ? "none" : "on-drag"}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: Math.max(24, insets.top),
          paddingBottom: Math.max(24, insets.bottom),
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 480,
            padding: 28,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 18,
          }}
        >
          <View style={{ marginBottom: 35 }}>
            <Link href="/" aria-label="Pool home">
              <Brand />
            </Link>
          </View>
          <TypographyScale.Provider value="auth">
            {children}
          </TypographyScale.Provider>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
