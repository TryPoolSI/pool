import { TypographyScale } from "./elements";
import { SkipLink } from "./web-accessibility";
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  ScrollView,
  StyleSheet,
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
import { familyPath, useActiveFamily } from "@/services/active-family";
import { queryClient } from "@/services/cache";
import { Brand, Avatar } from "@/features/app/presentation";
import { AuthForm } from "@/features/auth/auth-form";
import { ActionDialog } from "@/features/app/action-dialog";
import Link from "./link";
import { Icon } from "./icon";
import { colors, spacing, styles } from "./styles";
const homePath = "/app";
type Destination = readonly [
  href: string,
  label: string,
  icon: ComponentProps<typeof Icon>["name"],
];
const destinations: Destination[] = [
  [homePath, "Home", "home"],
  ["/app/attention", "Today", "check"],
  ["/app/schedule", "Schedule", "calendar"],
  ["/app/driving", "Driving", "activity"],
];
const setup: Destination[] = [
  ["/app/profile", "Profile", "users"],
  ["/app/vehicles", "Vehicles", "car"],
  ["/app/invitations", "Invitations", "shield"],
];
function ApplicationHomeLink({ compact = false }: { compact?: boolean }) {
  return (
    <Link href={homePath} aria-label="Pool home">
      <Brand compact={compact} />
    </Link>
  );
}
const shellStyles = StyleSheet.create({
  navigationItem: {
    justifyContent: "flex-start",
    paddingHorizontal: spacing.md,
  },
  mobileTab: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    flexDirection: "column",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  navigationLabel: { fontSize: 14, lineHeight: 20 },
  mobileTabLabel: { fontSize: 12, lineHeight: 16, textAlign: "center" },
  headerAction: { alignSelf: "center", marginVertical: 0 },
});
function NavigationItem({
  destination: [href, label, icon],
  current,
  mobile = false,
}: {
  destination: Destination;
  current: boolean;
  mobile?: boolean;
}) {
  const color = current ? colors.green : colors.muted;
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className="button plain"
      style={mobile ? shellStyles.mobileTab : shellStyles.navigationItem}
    >
      <Icon name={icon} color={color} />
      <Text
        style={[
          styles.text,
          mobile ? shellStyles.mobileTabLabel : shellStyles.navigationLabel,
          { color, fontWeight: current ? "700" : "400" },
        ]}
      >
        {label}
      </Text>
    </Link>
  );
}
function NavigationLinks({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  return (
    <View
      role="navigation"
      accessibilityLabel={mobile ? "Phone navigation" : "Application"}
      style={{ flexDirection: mobile ? "row" : "column", gap: spacing.xs }}
    >
      {destinations.map((destination) => (
        <NavigationItem
          key={destination[0]}
          destination={destination}
          current={pathname === destination[0]}
          mobile={mobile}
        />
      ))}
    </View>
  );
}
export function ApplicationShell({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions(),
    mobile = width <= 650,
    insets = useSafeAreaInsets(),
    { user } = useSession(),
    pathname = usePathname();
  const { data: family } = useActiveFamily();
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
  const contentInset = mobile ? spacing.lg : width <= 1200 ? spacing.xxl : 40;
  const myFamily: Destination | undefined = family
    ? [familyPath(family.id), "My family", "users"]
    : undefined;
  const setupDestinations = myFamily ? [myFamily, ...setup] : setup;
  const label =
    destinations.find((d) => d[0] === pathname)?.[1] ||
    setupDestinations.find((d) => d[0] === pathname)?.[1] ||
    (pathname.startsWith("/app/families/") ? "Family details" : undefined) ||
    (pathname.endsWith("/new") ? "Plan a ride" : "Ride details");
  const setupLinks = (
    <View
      style={{
        gap: spacing.xs,
        paddingTop: spacing.md,
        borderTopWidth: 1,
        borderColor: colors.line,
      }}
    >
      {setupDestinations.map((destination) => (
        <NavigationItem
          key={destination[0]}
          destination={destination}
          current={pathname === destination[0]}
        />
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
              paddingHorizontal: spacing.xl,
              gap: spacing.xl,
              flexGrow: 1,
            }}
          >
            <ApplicationHomeLink />
            <View
              style={{
                padding: spacing.md,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: 12,
              }}
            >
              <View style={styles.row}>
                <View
                  style={{
                    backgroundColor: colors.lime,
                    borderRadius: 18,
                    width: 36,
                    height: 36,
                    flexShrink: 0,
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
            <View
              style={{
                marginTop: "auto",
                borderTopWidth: 1,
                borderColor: colors.line,
              }}
            />
            <Link href="/app/rides/new" className="text-link">
              <Icon name="plus" size={16} color={colors.green} />
              Plan a ride
            </Link>
          </ScrollView>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View
            style={{
              minHeight: mobile ? 64 : 76,
              paddingHorizontal: contentInset,
              borderBottomWidth: 1,
              borderColor: colors.line,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: mobile ? spacing.xs : spacing.md,
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
                    styles.iconButton,
                    styles.plainIconButton,
                    shellStyles.headerAction,
                  ]}
                >
                  <Icon name="chevron-left" />
                </Pressable>
              )}
            {mobile ? (
              <View style={{ flex: 1, minWidth: 0 }}>
                <ApplicationHomeLink compact />
              </View>
            ) : (
              <Text
                style={[
                  styles.text,
                  { fontSize: 12, color: colors.muted, flex: 1 },
                ]}
              >
                Your family / {label}
              </Text>
            )}
            {!mobile && <Avatar name={context.data?.name ?? "Your account"} />}
            {width > 1200 && (
              <Text style={[styles.text, { fontSize: 12 }]}>
                {context.data?.name ?? "Your account"}
              </Text>
            )}
            <ActionDialog
              title="Account"
              triggerStyle={shellStyles.headerAction}
            >
              <Text style={styles.text}>{user?.email}</Text>
              <AuthForm mode="sign-out" />
            </ActionDialog>
            {mobile && (
              <ActionDialog
                title="Your Pool"
                triggerLabel="Menu"
                triggerStyle={shellStyles.headerAction}
              >
                <View style={{ gap: spacing.lg }}>
                  <NavigationLinks />
                  {setupLinks}
                  <Link href="/app/rides/new" className="text-link">
                    <Icon name="plus" size={16} color={colors.green} />
                    Plan a ride
                  </Link>
                </View>
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
                paddingHorizontal: contentInset,
                paddingTop: mobile ? spacing.xxl : 36,
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
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
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
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      queryClient.invalidateQueries({ queryKey: ["account"] })
                    }
                    style={[styles.button, styles.plainIconButton]}
                  >
                    <Text
                      style={[
                        styles.text,
                        styles.buttonText,
                        { color: colors.muted, fontWeight: "500" },
                      ]}
                    >
                      Refresh current data
                    </Text>
                  </Pressable>
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
            paddingVertical: spacing.xs,
            paddingHorizontal: spacing.sm,
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
          paddingBottom: 24,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 480,
            padding: spacing.xxl,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 18,
          }}
        >
          <View style={{ marginBottom: spacing.xxl }}>
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
