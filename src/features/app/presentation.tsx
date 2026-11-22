import { Image, View } from "react-native";
import logoMark from "@/assets/logo-mark.png";
import * as UI from "@/ui/elements";
import Link from "@/ui/link";
import { colors, fonts, radius, spacing } from "@/ui/styles";
import { Icon } from "@/ui/icon";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <UI.Box className="brand" style={compact ? { gap: spacing.sm } : undefined}>
      <Image
        source={logoMark}
        accessibilityIgnoresInvertColors
        aria-hidden={true}
        style={{ width: compact ? 36 : 44, height: compact ? 36 : 44 }}
      />
      <UI.Strong
        style={{
          fontFamily: fonts.display,
          fontSize: compact ? 26 : 32,
          lineHeight: compact ? 32 : 38,
          fontWeight: "800",
          letterSpacing: compact ? -1.1 : -1.4,
        }}
      >
        pool.
      </UI.Strong>
    </UI.Box>
  );
}
export function PageHeading({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <UI.Header className="page-heading">
      <UI.Box style={{ flexShrink: 1 }}>
        <UI.Heading1 style={{ marginBottom: 0 }}>{title}</UI.Heading1>
        {children && (
          <UI.Paragraph className="page-description">{children}</UI.Paragraph>
        )}
      </UI.Box>
      {action}
    </UI.Header>
  );
}
// A one-or-two-word state. The tone is carried by fill, outline and icon
// together, never by colour alone:
//   act      solid sun          the person looking has to do something
//   open     outlined, car      the ride has no driver yet
//   waiting  grey, clock        someone else has to answer
//   set      sky wash, check    settled
const badgeIcons = {
  act: "arrow-right",
  open: "car",
  waiting: "clock",
  set: "check",
  positive: "check",
} as const;
const badgeInk = {
  act: colors.ink,
  open: colors.sunInk,
  waiting: colors.muted,
  set: colors.blue,
  positive: colors.blue,
} as const;
export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?:
    | "neutral"
    | "attention"
    | "positive"
    | "act"
    | "open"
    | "waiting"
    | "set";
}) {
  const icon =
    tone in badgeIcons ? badgeIcons[tone as keyof typeof badgeIcons] : null;
  return (
    <UI.Box className={`status-badge ${tone}`}>
      {icon ? (
        <Icon
          name={icon}
          size={13}
          color={badgeInk[tone as keyof typeof badgeInk]}
        />
      ) : (
        <View
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: radius.full,
            backgroundColor: tone === "attention" ? colors.sun : colors.outline,
          }}
        />
      )}
      <UI.Inline>{children}</UI.Inline>
    </UI.Box>
  );
}
export function RouteSummary({
  pickup,
  destination,
}: {
  pickup: string;
  destination: string;
}) {
  return (
    <UI.Box className="route-summary">
      <UI.Box>
        <UI.Box style={{ width: 80, flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <Icon name="ring" size={12} color={colors.muted} />
          <UI.Small>Pickup</UI.Small>
        </UI.Box>
        <UI.Paragraph style={{ flex: 1, marginVertical: 0 }}>
          {pickup}
        </UI.Paragraph>
      </UI.Box>
      <UI.Box>
        <UI.Box style={{ width: 80, flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <Icon name="flag" size={12} color={colors.muted} />
          <UI.Small>Drop-off</UI.Small>
        </UI.Box>
        <UI.Paragraph style={{ flex: 1, marginVertical: 0 }}>
          {destination}
        </UI.Paragraph>
      </UI.Box>
    </UI.Box>
  );
}
const emptyStateText = {
  marginTop: 0,
  marginBottom: 0,
  textAlign: "center",
} as const;

export function EmptyState({
  title,
  children,
  href,
  action,
  icon = "car",
}: {
  title: string;
  children: React.ReactNode;
  href?: string;
  action?: string;
  icon?: React.ComponentProps<typeof Icon>["name"];
}) {
  return (
    <UI.Box className="empty-state">
      <UI.Box className="empty-symbol">
        <Icon name={icon} size={26} color={colors.ink} />
      </UI.Box>
      <UI.Heading3 style={emptyStateText}>{title}</UI.Heading3>
      <UI.Paragraph style={emptyStateText}>{children}</UI.Paragraph>
      {href && (
        <Link
          className="button primary"
          href={href}
          style={{ alignSelf: "center", marginTop: spacing.sm }}
        >
          {action}
        </Link>
      )}
    </UI.Box>
  );
}

export { Disclosure } from "./disclosure";
export { ActionDialog } from "./action-dialog";

export { Icon } from "@/ui/icon";

export function Avatar({
  name,
  tone = "sky",
}: {
  name: string;
  tone?: string;
}) {
  return (
    <UI.Inline className={`avatar ${tone}`} aria-hidden={true}>
      {name
        .replace(/\([^)]*\)/g, "")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0])
        .join("")}
    </UI.Inline>
  );
}
