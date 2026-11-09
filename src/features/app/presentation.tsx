import Svg, { Path } from "react-native-svg";
import * as UI from "@/ui/elements";
import Link from "@/ui/link";

export function Brand() {
  return (
    <UI.Box className="brand">
      <Svg
        aria-hidden={true}
        width="26"
        height="29"
        viewBox="0 0 26 29"
        fill="none"
      >
        <Path
          d="M4 23V8a5 5 0 0 1 10 0v15M12 23V8a5 5 0 0 1 10 0v15M2 27h22"
          stroke="#253c35"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </Svg>
      <UI.Strong
        style={{
          fontFamily: "Manrope",
          fontSize: 37,
          lineHeight: 42,
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
      <UI.Box>
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
        <UI.Small style={{ width: 77 }}>○ Pickup</UI.Small>
        <UI.Paragraph>{pickup}</UI.Paragraph>
      </UI.Box>
      <UI.Box>
        <UI.Small style={{ width: 77 }}>▪ Drop-off</UI.Small>
        <UI.Paragraph>{destination}</UI.Paragraph>
      </UI.Box>
    </UI.Box>
  );
}
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
      <UI.Heading3>{title}</UI.Heading3>
      <UI.Paragraph>{children}</UI.Paragraph>
      {href && (
        <Link className="button secondary" href={href}>
          {action}
        </Link>
      )}
    </UI.Box>
  );
}

export { Disclosure } from "./disclosure";
export { ActionDialog } from "./action-dialog";

const paths: Record<string, string> = {
  home: "m3 11 9-8 9 8M5 10v11h14V10M9 21v-8h6v8",
  calendar:
    "M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2ZM7 3v5m10-5v5M3 11h18m-14 4h2m4 0h2",
  users:
    "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3m20 0v-3a4 4 0 0 0-3-3.8M16 3a4 4 0 0 1 0 8M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  check: "m5 12 4 4L19 6",
  car: "m4 10 2-6h12l2 6M3 10h18v8H3V10Zm2 8v3m14-3v3M6 14h2m8 0h2",
  shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  leaf: "M20 3c-11 0-17 6-14 12s14 4 14-12ZM5 21 16 10",
  warning: "m12 3 10 18H2L12 3Zm0 6v5m0 3h.01",
  info: "M12 11v6m0-10h.01M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0",
};
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <Svg
      aria-hidden={true}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#253c35"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d={paths[name] || paths.info} />
    </Svg>
  );
}
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
