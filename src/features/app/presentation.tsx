import { Image } from "react-native";
import logoMark from "@/assets/logo-mark.png";
import * as UI from "@/ui/elements";
import Link from "@/ui/link";
import { spacing } from "@/ui/styles";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <UI.Box className="brand" style={compact ? { gap: spacing.sm } : undefined}>
      <Image
        source={logoMark}
        accessibilityIgnoresInvertColors
        aria-hidden={true}
        style={{ width: compact ? 34 : 48, height: compact ? 34 : 48 }}
      />
      <UI.Strong
        style={{
          fontFamily: "Manrope",
          fontSize: compact ? 27 : 37,
          lineHeight: compact ? 32 : 42,
          fontWeight: "800",
          letterSpacing: -2,
        }}
      >
        pool.
      </UI.Strong>
    </UI.Box>
  );
}
export function PageHeading({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <UI.Header className="page-heading">
      <UI.Box style={{ flexShrink: 1 }}>
        {eyebrow && <UI.Paragraph className="eyebrow">{eyebrow}</UI.Paragraph>}
        <UI.Heading1 style={{ marginBottom: 0 }}>{title}</UI.Heading1>
        {children && (
          <UI.Paragraph className="page-description">{children}</UI.Paragraph>
        )}
      </UI.Box>
      {action}
    </UI.Header>
  );
}
export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "attention" | "positive";
}) {
  return (
    <UI.Inline className={`status-badge ${tone}`}>
      <UI.Inline aria-hidden={true}>
        {tone === "attention" ? "! " : tone === "positive" ? "✓ " : "• "}
      </UI.Inline>
      <UI.Inline>{children}</UI.Inline>
    </UI.Inline>
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
        <UI.Small style={{ width: 80, flexShrink: 0 }}>○ Pickup</UI.Small>
        <UI.Paragraph style={{ flex: 1, marginVertical: 0 }}>
          {pickup}
        </UI.Paragraph>
      </UI.Box>
      <UI.Box>
        <UI.Small style={{ width: 80, flexShrink: 0 }}>▪ Drop-off</UI.Small>
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
}: {
  title: string;
  children: React.ReactNode;
  href?: string;
  action?: string;
}) {
  return (
    <UI.Box className="empty-state">
      <UI.Inline aria-hidden={true} className="empty-symbol">
        ↗
      </UI.Inline>
      <UI.Heading3 style={emptyStateText}>{title}</UI.Heading3>
      <UI.Paragraph style={emptyStateText}>{children}</UI.Paragraph>
      {href && (
        <Link
          className="button secondary"
          href={href}
          style={{ alignSelf: "center", marginTop: spacing.xs }}
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
  tone = "green",
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
