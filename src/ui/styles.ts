import { StyleSheet, type ViewStyle, type TextStyle } from "react-native";
// Every value here is documented in DESIGN.md. Screens read tokens; they never
// write a hex, radius or font size of their own.
export const colors = {
  // Surfaces
  canvas: "#F2F8FB",
  surface: "#FFFFFF",
  tint: "#E6F2F8",
  cream: "#FBF1DE",
  // Text and lines
  ink: "#14294A",
  muted: "#55657F",
  placeholder: "#8FA0B5",
  line: "#D8E5ED",
  outline: "#7D93A8",
  // Sky: the car. Primary fill, and deep blue for links and settled state.
  sky: "#2BBDE6",
  skyPressed: "#17A5D1",
  blue: "#0A6F9A",
  skyWash: "#E3F5FB",
  // Sun: someone has to act.
  sun: "#F5C01E",
  sunInk: "#7A4A00",
  sunWash: "#FFF4CF",
  // Coral: something failed, or a destructive action.
  coral: "#F06656",
  coralInk: "#A62B1C",
  coralWash: "#FFEDEA",
  // Chrome
  glass: "rgba(255,255,255,0.72)",
  glassLine: "rgba(255,255,255,0.9)",
  scrim: "rgba(20,41,74,0.36)",
  focus: "#14294A",
};
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };
export const radius = { sm: 8, md: 14, lg: 20, xl: 28, full: 999 };
export const fonts = { display: "Manrope", body: "DM Sans" };
export const shadow = {
  card: "0 1px 2px rgba(20,41,74,0.05), 0 6px 20px rgba(20,41,74,0.06)",
  float: "0 2px 6px rgba(20,41,74,0.08), 0 12px 32px rgba(20,41,74,0.16)",
};
export const controlHeight = 48;
export const compactHeight = 44;
export const fieldHeight = 48;
// Height reserved under scrolling content for the floating phone tab bar.
export const tabBarHeight = 64;
const border = { borderWidth: 1, borderColor: colors.line };
export const styles = StyleSheet.create({
  text: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.ink,
    flexShrink: 1,
  },
  box: { minWidth: 0 },
  paragraph: { color: colors.muted, marginVertical: 6 },
  h1: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -0.9,
    marginBottom: spacing.md,
  },
  h2: {
    fontFamily: fonts.display,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
    letterSpacing: -0.3,
    marginBottom: spacing.md,
  },
  h3: {
    fontFamily: fonts.display,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "700",
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  small: { fontSize: 14, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 16, color: colors.muted },
  strong: { fontWeight: "700" },
  panel: {
    ...border,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    // Native margins do not collapse: 6 + 6 puts stacked cards 12 apart.
    marginVertical: 6,
    minWidth: 0,
    boxShadow: shadow.card,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
    marginVertical: spacing.lg,
    alignItems: "flex-start",
  },
  gridChild: { flexBasis: "47%", flexGrow: 1, minWidth: 0, marginVertical: 0 },
  button: {
    ...border,
    minHeight: controlHeight,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  iconButton: {
    width: compactHeight,
    height: compactHeight,
    minHeight: compactHeight,
    borderRadius: radius.full,
    flexShrink: 0,
    padding: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  plainIconButton: { borderWidth: 0, backgroundColor: "transparent" },
  buttonText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
    color: colors.ink,
  },
  primary: { backgroundColor: colors.sky, borderColor: colors.sky },
  primaryText: { color: colors.ink },
  danger: { backgroundColor: colors.coralWash, borderColor: colors.coralWash },
  dangerText: { color: colors.coralInk },
  quiet: { backgroundColor: "transparent", borderColor: "transparent" },
  quietText: { color: colors.blue },
  pressed: { opacity: 0.72 },
  link: {
    color: colors.blue,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
    minHeight: compactHeight,
    paddingVertical: 10,
  },
  field: {
    ...border,
    borderColor: colors.outline,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: fieldHeight,
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
    backgroundColor: colors.surface,
    minWidth: 0,
    width: "100%",
  },
  label: { gap: 6, minWidth: 0 },
  labelText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    color: colors.ink,
  },
  hint: { fontSize: 14, lineHeight: 20, color: colors.muted },
  checkboxLabel: {
    ...border,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: controlHeight,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  checkboxLabelOn: {
    backgroundColor: colors.skyWash,
    borderColor: colors.sky,
  },
  checkbox: {
    borderWidth: 1.5,
    borderColor: colors.outline,
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: colors.sky, borderColor: colors.sky },
  form: {
    gap: spacing.lg,
    marginVertical: spacing.sm,
    maxWidth: 640,
    width: "100%",
  },
  fieldset: { gap: spacing.lg, minWidth: 0 },
  alert: {
    color: colors.coralInk,
    backgroundColor: colors.coralWash,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    fontSize: 15,
    lineHeight: 22,
  },
  status: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.skyWash,
    color: colors.blue,
    borderRadius: radius.md,
    fontSize: 15,
    lineHeight: 22,
  },
  list: { marginVertical: spacing.sm },
  li: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    minWidth: 0,
  },
  nav: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: spacing.md,
    rowGap: spacing.xs,
    marginVertical: spacing.md,
  },
  disabled: { opacity: 0.5 },
});
type Rule = {
  -readonly [K in keyof (ViewStyle & TextStyle)]: (ViewStyle & TextStyle)[K];
};
const disc = {
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
} as const;
const classes: Record<string, Rule> = {
  "page-heading": {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xl,
    marginBottom: spacing.xl,
  },
  "page-description": { marginTop: spacing.xs, marginBottom: 0 },
  "meta-label": {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -1.4,
    color: colors.ink,
  },
  panel: styles.panel as Rule,
  "person-card": styles.panel as Rule,
  "dashboard-grid": styles.grid as Rule,
  "people-grid": styles.grid as Rule,
  "setup-cards": styles.grid as Rule,
  "person-meta": styles.row as Rule,
  "driver-summary": {
    ...styles.row,
    backgroundColor: colors.skyWash,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  "driver-facts": {
    flexDirection: "row",
    gap: spacing.lg,
    flexWrap: "wrap",
    fontSize: 14,
    color: colors.muted,
  },
  "assignment-state": {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.md,
    fontSize: 15,
  },
  "team-icon": {
    ...disc,
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.cream,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: "#CDEEFA",
    color: "#0A5578",
    textAlign: "center",
    fontSize: 14,
    lineHeight: 40,
    fontWeight: "700",
    overflow: "hidden",
    flexShrink: 0,
  },
  // The three passengers in the logo.
  sky: { backgroundColor: "#CDEEFA", color: "#0A5578" },
  sun: { backgroundColor: "#FFE7A3", color: "#6B4300" },
  coral: { backgroundColor: "#FFD8D2", color: "#8A2A1E" },
  "text-link": {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: compactHeight,
    fontSize: 16,
    fontWeight: "600",
    color: colors.blue,
  },
  notice: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.skyWash,
    color: colors.blue,
    fontSize: 15,
  },
  attention: { backgroundColor: colors.sunWash, color: colors.sunInk },
  positive: { backgroundColor: colors.skyWash, color: colors.blue },
  neutral: { backgroundColor: colors.tint, color: colors.muted },
  // Ride badge tones (see rideSummary): whose move it is, at a glance.
  // act: yours, solid sun. open: no driver yet, an outlined empty slot.
  // waiting: someone else's answer, grey. set: settled, sky.
  act: { backgroundColor: colors.sun, color: colors.ink },
  open: {
    backgroundColor: colors.surface,
    color: colors.sunInk,
    borderWidth: 1.5,
    borderColor: colors.sun,
    paddingVertical: 1.5,
  },
  waiting: { backgroundColor: colors.tint, color: colors.muted },
  set: { backgroundColor: colors.skyWash, color: colors.blue },
  "empty-state": {
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    alignItems: "center",
  },
  "empty-symbol": {
    ...disc,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.cream,
    marginBottom: spacing.xs,
  },
  "status-badge": {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderRadius: radius.full,
    paddingVertical: 3,
    paddingLeft: spacing.sm,
    paddingRight: 10,
    backgroundColor: colors.tint,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  "route-summary": { gap: spacing.sm, marginVertical: spacing.md },
  "offer-form": { width: "100%", flexBasis: "100%", minWidth: 0 },
  "child-row": {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  "coverage-summary": { gap: spacing.md, marginTop: 0, borderWidth: 0 },
  "coverage-summary-main": { ...styles.row, alignItems: "flex-start" },
  "coverage-summary-foot": {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: spacing.md,
  },
  "ride-list": {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.xxl,
  },
  "ride-card-top": {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    flexWrap: "wrap",
  },
  "ride-card-heading": {
    ...styles.row,
    alignItems: "flex-start",
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 220,
    minWidth: 0,
  },
  "ride-card-times": { flex: 1, gap: 2, color: colors.muted },
  "ride-date": {
    width: 48,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.tint,
    overflow: "hidden",
    alignItems: "center",
    flexShrink: 0,
  },
  "ride-card-bottom": {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
    marginTop: spacing.md,
  },
  "ride-card-driver": {
    ...styles.row,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 144,
  },
  "ride-card-note": { marginTop: spacing.sm, fontSize: 14 },
  "ride-time": { marginBottom: spacing.lg, fontSize: 15, color: colors.muted },
  "ride-current-driver": { fontSize: 15 },
  "ride-overview": {
    flexDirection: "row",
    gap: 0,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
    backgroundColor: colors.surface,
    ...border,
    borderRadius: radius.lg,
    overflow: "hidden",
    boxShadow: shadow.card,
  },
  "feature-details": {
    backgroundColor: colors.skyWash,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xxl,
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
    justifyContent: "center",
    gap: spacing.lg,
  },
  "feature-state": {
    fontFamily: fonts.display,
    color: colors.sunInk,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    letterSpacing: -0.6,
    marginVertical: spacing.md,
  },
  "section-caption": { fontSize: 14, lineHeight: 20, color: colors.muted },
  "section-head": {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  number: {
    backgroundColor: colors.cream,
    borderRadius: radius.sm,
    fontSize: 13,
    lineHeight: 22,
    paddingHorizontal: 7,
  },
  "task-icon": {
    ...disc,
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.sunWash,
    color: colors.sunInk,
  },
  "task-summary": {
    ...styles.row,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 180,
  },
  "journey-list": {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
    marginVertical: spacing.lg,
  },
  "activity-list": { gap: 0, marginVertical: spacing.lg },
  "form-section": { gap: spacing.lg, marginTop: spacing.sm },
  "form-pair": { flexDirection: "row", gap: spacing.lg },
  "ride-plan": { width: "100%", maxWidth: 640, alignSelf: "center" },
  candidate: {
    padding: spacing.lg,
    ...border,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  "invitation-link": { gap: spacing.md },
  "ride-next-action": { marginTop: spacing.md, marginBottom: spacing.xs },
};
const textKeys = new Set([
  "color",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "textTransform",
  "textDecorationLine",
]);
export function textRules(style: Rule): TextStyle {
  return Object.fromEntries(
    Object.entries(style).filter(([key]) => textKeys.has(key)),
  ) as TextStyle;
}
export function classStyle(names = "", width = 390, parent = ""): Rule {
  let result: Rule = {};
  for (const name of names.split(/\s+/)) Object.assign(result, classes[name]);
  const mobile = width <= 650,
    columns = width > 900;
  if (mobile && /\b(panel|person-card)\b/.test(names))
    result.padding = spacing.lg;
  if (
    /(dashboard-grid|people-grid|setup-cards|ride-list|journey-list|form-pair|ride-overview)/.test(
      names,
    ) &&
    (!columns || (names === "form-pair" && mobile))
  )
    result.flexDirection = "column";
  if (/dashboard-grid|people-grid|setup-cards/.test(parent))
    Object.assign(
      result,
      columns ? styles.gridChild : { width: "100%", marginVertical: 0 },
    );
  if (/ride-list|journey-list/.test(parent))
    Object.assign(
      result,
      {
        ...styles.panel,
        marginVertical: 0,
        padding: mobile ? spacing.lg : spacing.xl,
      },
      columns ? styles.gridChild : { width: "100%" },
    );
  if (parent.includes("ride-overview"))
    Object.assign(result, {
      flex: columns ? 1 : undefined,
      width: columns ? undefined : "100%",
      borderWidth: 0,
      borderRadius: 0,
      marginVertical: 0,
      padding: mobile ? spacing.xl : spacing.xxl,
    });
  if (parent === "form-pair")
    Object.assign(result, {
      flex: columns ? 1 : undefined,
      minWidth: 0,
      width: columns ? undefined : "100%",
    });
  if (parent === "route-summary")
    Object.assign(result, {
      flexDirection: "row",
      gap: spacing.sm,
      alignItems: "baseline",
    });
  if (parent === "task-list")
    Object.assign(result, {
      ...styles.panel,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      flexWrap: "wrap",
      padding: mobile ? spacing.lg : spacing.xl,
      marginTop: spacing.md,
      marginBottom: 0,
    });
  if (parent === "activity-list")
    Object.assign(result, {
      borderLeftWidth: 2,
      borderLeftColor: colors.sky,
      paddingLeft: spacing.lg,
    });
  if (mobile) {
    if (names === "page-heading")
      Object.assign(result, {
        flexDirection: "column",
        alignItems: "flex-start",
        gap: spacing.md,
        marginBottom: spacing.xl,
      });
  }
  return result;
}
