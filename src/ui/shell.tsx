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
import { router, useGlobalSearchParams, usePathname } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/services/session";
import { familyPath, useActiveFamily } from "@/services/active-family";
import { queryClient } from "@/services/cache";
import { useLiveData } from "@/services/live";
import { Brand, Avatar } from "@/features/app/presentation";
import { AuthForm } from "@/features/auth/auth-form";
import { ActionDialog } from "@/features/app/action-dialog";
import Link from "./link";
import { Icon } from "./icon";
import { Glass } from "./glass";
import {
  colors,
  compactHeight,
  radius,
  spacing,
  styles,
  tabBarHeight,
} from "./styles";
import appConfig from "../../app.json";

const homePath = "/app";
const planPath = "/app/rides/new";
const headerHeight = 56;
type Destination = readonly [
  href: string,
  label: string,
  icon: ComponentProps<typeof Icon>["name"],
];
const destinations: Destination[] = [
  [homePath, "Home", "home"],
  ["/app/attention", "Today", "check"],
  ["/app/schedule", "Schedule", "calendar"],
  ["/app/driving", "Driving", "car"],
];
const setup: Destination[] = [
  ["/app/vehicles", "Cars", "car-side"],
  ["/app/invitations", "Invitations", "mail"],
  ["/app/profile", "Profile", "user"],
];
const shellStyles = StyleSheet.create({
  sidebarItem: {
    justifyContent: "flex-start",
    alignSelf: "stretch",
    minHeight: compactHeight,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    height: tabBarHeight - 12,
    minHeight: 0,
    flexDirection: "column",
    justifyContent: "center",
    alignSelf: "auto",
    gap: 2,
    paddingHorizontal: 2,
    paddingVertical: 0,
    borderRadius: radius.full,
  },
  sheetRow: {
    justifyContent: "flex-start",
    alignSelf: "stretch",
    minHeight: 52,
    paddingHorizontal: 0,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.line,
    borderRadius: 0,
  },
});

function NavigationItem({
  destination: [href, label, icon],
  current,
  variant,
}: {
  destination: Destination;
  current: boolean;
  variant: "sidebar" | "tab" | "sheet";
}) {
  const color =
    variant === "sheet" ? colors.ink : current ? colors.blue : colors.muted;
  const fill = !current
    ? "transparent"
    : variant === "tab"
      ? colors.skyWash
      : variant === "sidebar"
        ? colors.surface
        : "transparent";
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className="button plain"
      style={[
        variant === "tab"
          ? shellStyles.tab
          : variant === "sheet"
            ? shellStyles.sheetRow
            : shellStyles.sidebarItem,
        { backgroundColor: fill },
      ]}
    >
      <Icon name={icon} size={variant === "tab" ? 22 : 20} color={color} />
      <Text
        numberOfLines={1}
        style={[
          styles.text,
          variant === "tab"
            ? { fontSize: 12, lineHeight: 14, textAlign: "center" }
            : { fontSize: 16, lineHeight: 22, flex: 1 },
          { color, fontWeight: current ? "700" : "500" },
        ]}
      >
        {label}
      </Text>
      {variant === "sheet" && (
        <Icon name="chevron-right" size={18} color={colors.muted} />
      )}
    </Link>
  );
}

// "You": the account sheet. On a phone it also holds the setup destinations
// that live in the sidebar on wider screens.
function AccountSheet({
  name,
  email,
  links,
  trigger,
  triggerStyle,
}: {
  name: string;
  email?: string;
  links: Destination[];
  trigger: ReactNode;
  triggerStyle?: ComponentProps<typeof ActionDialog>["triggerStyle"];
}) {
  const pathname = usePathname();
  return (
    <ActionDialog title="Account" trigger={trigger} triggerStyle={triggerStyle}>
      <View style={[styles.row, { marginBottom: spacing.md }]}>
        <Avatar name={name} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.text, { fontWeight: "700" }]}>{name}</Text>
          {email && (
            <Text style={[styles.text, styles.small, { color: colors.muted }]}>
              {email}
            </Text>
          )}
        </View>
      </View>
      {links.length > 0 && (
        <View
          role="navigation"
          accessibilityLabel="Your setup"
          style={{ borderTopWidth: 1, borderColor: colors.line }}
        >
          {links.map((destination) => (
            <NavigationItem
              key={destination[0]}
              destination={destination}
              current={pathname === destination[0]}
              variant="sheet"
            />
          ))}
        </View>
      )}
      <AuthForm mode="sign-out" />
      <Text
        role="contentinfo"
        style={[styles.text, styles.caption, { textAlign: "center" }]}
      >
        Pool v{appConfig.expo.version}
      </Text>
    </ActionDialog>
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
  useLiveData();
  useEffect(() => {
    content.current?.scrollTo({ y: 0, animated: false });
  }, [pathname]);
  const context = useQuery({
    queryKey: ["account", user?.id, "shell"],
    enabled: Boolean(user),
    queryFn: async () => {
      const client = createClient();
      const profile = await client
        .from("profiles")
        .select("display_name")
        .eq("id", user!.id)
        .maybeSingle();
      if (profile.error) throw new Error("Account context could not be loaded");
      return { name: profile.data?.display_name || "" };
    },
  });
  const name = context.data?.name || family?.name || "Your account";
  const sidebar = width > 1200 ? 248 : 216;
  const contentInset = mobile ? spacing.lg : width <= 1200 ? spacing.xxl : 40;
  const myFamily: Destination | undefined = family
    ? [familyPath(family.id), "My family", "users"]
    : undefined;
  const setupDestinations = myFamily ? [myFamily, ...setup] : setup;
  const detail = /^\/app\/(families|circles|rides)\//.test(pathname);
  const tabBottom = Math.max(insets.bottom, spacing.md);
  // From the Schedule, the plan button carries the day being looked at.
  const { date } = useGlobalSearchParams<{ date?: string }>();
  const planHref =
    pathname === "/app/schedule" && /^\d{4}-\d\d-\d\d$/.test(date ?? "")
      ? `${planPath}?date=${date}`
      : planPath;
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <SkipLink />
      <View style={{ flex: 1, flexDirection: "row" }}>
        {!mobile && (
          <ScrollView
            style={{
              width: sidebar,
              maxWidth: sidebar,
              backgroundColor: colors.tint,
            }}
            contentContainerStyle={{
              paddingTop: insets.top + spacing.xxl,
              paddingBottom: spacing.xl,
              paddingHorizontal: spacing.lg,
              gap: spacing.xl,
              flexGrow: 1,
            }}
          >
            <View style={{ paddingHorizontal: spacing.sm }}>
              <Link href={homePath} aria-label="Pool home">
                <Brand />
              </Link>
            </View>
            <Link
              href={planHref}
              className="button primary"
              style={{ alignSelf: "stretch" }}
            >
              <Icon name="plus" size={18} />
              Plan a ride
            </Link>
            <View
              role="navigation"
              accessibilityLabel="Application"
              style={{ gap: spacing.xs }}
            >
              {destinations.map((destination) => (
                <NavigationItem
                  key={destination[0]}
                  destination={destination}
                  current={pathname === destination[0]}
                  variant="sidebar"
                />
              ))}
            </View>
            <View
              role="navigation"
              accessibilityLabel="Your setup"
              style={{ gap: spacing.xs }}
            >
              <Text
                style={[
                  styles.text,
                  styles.caption,
                  {
                    fontWeight: "700",
                    paddingHorizontal: spacing.md,
                    marginBottom: spacing.xs,
                  },
                ]}
              >
                Your setup
              </Text>
              {setupDestinations.map((destination) => (
                <NavigationItem
                  key={destination[0]}
                  destination={destination}
                  current={pathname === destination[0]}
                  variant="sidebar"
                />
              ))}
            </View>
            <View style={{ marginTop: "auto" }}>
              <AccountSheet
                name={name}
                email={user?.email}
                links={[]}
                triggerStyle={{ alignSelf: "stretch" }}
                trigger={
                  <View
                    style={[
                      styles.row,
                      {
                        padding: spacing.sm,
                        borderRadius: radius.md,
                        backgroundColor: colors.surface,
                      },
                    ]}
                  >
                    <Avatar name={name} />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.text,
                        { flex: 1, fontSize: 15, fontWeight: "600" },
                      ]}
                    >
                      {name}
                    </Text>
                    <Icon name="chevron-up" size={16} color={colors.muted} />
                  </View>
                }
              />
            </View>
          </ScrollView>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
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
                    progressViewOffset={
                      mobile ? insets.top + headerHeight : insets.top
                    }
                    tintColor={colors.blue}
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
                paddingTop: mobile
                  ? insets.top + headerHeight + spacing.xl
                  : insets.top + 40,
                paddingBottom: mobile
                  ? tabBarHeight + tabBottom + spacing.xxxl
                  : 48,
              }}
            >
              <View
                nativeID="main-content"
                role="main"
                tabIndex={-1}
                style={{
                  width: "100%",
                  maxWidth: 1120,
                  alignSelf: "center",
                  flex: 1,
                }}
              >
                {children}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
          {mobile && (
            <Glass
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                paddingTop: insets.top,
                borderWidth: 0,
                borderBottomWidth: 1,
              }}
            >
              <View
                style={{
                  height: headerHeight,
                  paddingLeft: detail ? spacing.xs : spacing.lg,
                  paddingRight: spacing.md,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.xs,
                }}
              >
                {detail ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                    onPress={() =>
                      router.canGoBack()
                        ? router.back()
                        : router.replace(homePath)
                    }
                    style={({ pressed }) => [
                      styles.button,
                      styles.iconButton,
                      styles.plainIconButton,
                      { alignSelf: "center" },
                      pressed ? styles.pressed : undefined,
                    ]}
                  >
                    <Icon name="chevron-left" size={24} />
                  </Pressable>
                ) : null}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Link href={homePath} aria-label="Pool home">
                    <Brand compact />
                  </Link>
                </View>
                <AccountSheet
                  name={name}
                  email={user?.email}
                  links={setupDestinations}
                  triggerStyle={{
                    alignSelf: "center",
                    minWidth: compactHeight,
                    minHeight: compactHeight,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  trigger={<Avatar name={name} />}
                />
              </View>
            </Glass>
          )}
        </View>
      </View>
      {mobile && (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            left: spacing.lg,
            right: spacing.lg,
            bottom: tabBottom,
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.sm,
          }}
        >
          <Glass
            interactive
            style={{
              flex: 1,
              height: tabBarHeight,
              borderRadius: radius.full,
              padding: 5,
              overflow: "hidden",
            }}
          >
            <View
              role="navigation"
              accessibilityLabel="Phone navigation"
              style={{ flexDirection: "row", gap: 2 }}
            >
              {destinations.map((destination) => (
                <NavigationItem
                  key={destination[0]}
                  destination={destination}
                  current={pathname === destination[0]}
                  variant="tab"
                />
              ))}
            </View>
          </Glass>
          {pathname !== planPath && (
            <Glass
              interactive
              tint={colors.sky}
              style={{
                width: tabBarHeight,
                height: tabBarHeight,
                borderRadius: radius.full,
                overflow: "hidden",
              }}
            >
              <Link
                href={planHref}
                aria-label="Plan a ride"
                className="button plain"
                style={{
                  width: tabBarHeight - 2,
                  height: tabBarHeight - 2,
                  alignSelf: "auto",
                  paddingHorizontal: 0,
                  paddingVertical: 0,
                  borderRadius: radius.full,
                }}
              >
                <Icon name="plus" size={26} />
              </Link>
            </Glass>
          )}
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
          paddingHorizontal: spacing.lg,
          paddingTop: Math.max(spacing.xxl, insets.top),
          paddingBottom: Math.max(spacing.xxl, insets.bottom),
        }}
      >
        <View
          style={[
            styles.panel,
            { width: "100%", maxWidth: 440, padding: spacing.xxl },
          ]}
        >
          <View style={{ marginBottom: spacing.xl }}>
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
