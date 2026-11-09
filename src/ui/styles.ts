import { StyleSheet, type ViewStyle, type TextStyle } from "react-native";
export const colors = {
  canvas: "#f6f7f2",
  surface: "#fff",
  sidebar: "#f0f2ea",
  ink: "#253c35",
  muted: "#5b6c64",
  line: "#dce2d9",
  green: "#255741",
  soft: "#edf3e8",
  lime: "#dfe9bd",
  amber: "#785016",
  amberBg: "#faf0d8",
  danger: "#952c22",
  outline: "#718477",
};
const border = { borderWidth: 1, borderColor: colors.line };
export const styles = StyleSheet.create({
  text: {
    fontFamily: "DM Sans",
    fontSize: 15,
    lineHeight: 23,
    color: colors.ink,
    flexShrink: 1,
  },
  box: { minWidth: 0 },
  paragraph: { color: colors.muted, marginVertical: 7 },
  h1: {
    fontFamily: "Manrope",
    fontSize: 36,
    lineHeight: 45,
    fontWeight: "700",
    letterSpacing: -1.3,
    marginBottom: 12,
  },
  h2: {
    fontFamily: "Manrope",
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "700",
    letterSpacing: -0.55,
    marginBottom: 14,
  },
  h3: {
    fontFamily: "Manrope",
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "700",
    marginTop: 18,
    marginBottom: 10,
  },
  small: { fontSize: 13, lineHeight: 20 },
  strong: { fontWeight: "700" },
  panel: {
    ...border,
    backgroundColor: colors.surface,
    borderRadius: 15,
    padding: 25,
    marginVertical: 16,
    minWidth: 0,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 11 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 20,
    marginVertical: 24,
    alignItems: "flex-start",
  },
  gridChild: { flexBasis: "47%", flexGrow: 1, minWidth: 0, marginVertical: 0 },
  button: {
    ...border,
    minHeight: 44,
    borderRadius: 9,
    paddingVertical: 11,
    paddingHorizontal: 17,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  buttonText: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
    color: colors.ink,
  },
  primary: { backgroundColor: colors.green, borderColor: colors.green },
  primaryText: { color: "white" },
  link: {
    color: colors.green,
    fontSize: 14,
    lineHeight: 22,
    minHeight: 44,
    paddingVertical: 11,
  },
  field: {
    ...border,
    borderColor: colors.outline,
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 12,
    minHeight: 46,
    fontFamily: "DM Sans",
    fontSize: 16,
    lineHeight: 23,
    color: colors.ink,
    backgroundColor: colors.surface,
    minWidth: 0,
    width: "100%",
  },
  label: { gap: 7, minWidth: 0 },
  labelText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
    color: colors.ink,
  },
  checkboxLabel: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 12,
    minHeight: 44,
    backgroundColor: colors.soft,
    borderRadius: 10,
  },
  checkbox: {
    ...border,
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  form: { gap: 16, marginVertical: 20, maxWidth: 760, width: "100%" },
  fieldset: { gap: 19, minWidth: 0 },
  alert: {
    color: colors.danger,
    backgroundColor: "#fff1ee",
    borderLeftWidth: 3,
    borderLeftColor: "#ad4035",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  status: {
    padding: 12,
    backgroundColor: colors.soft,
    color: colors.green,
    borderRadius: 9,
  },
  list: { gap: 0, marginVertical: 16 },
  li: {
    paddingVertical: 17,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    minWidth: 0,
  },
  nav: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginVertical: 18 },
  disabled: { opacity: 0.6 },
});
type Rule = {
  -readonly [K in keyof (ViewStyle & TextStyle)]: (ViewStyle & TextStyle)[K];
};
const classes: Record<string, Rule> = {
  "page-heading": {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 24,
    marginBottom: 30,
  },
  "page-description": { marginTop: 11, marginBottom: 0, fontSize: 15 },
  eyebrow: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    fontFamily: "Manrope",
    fontSize: 37,
    lineHeight: 42,
    fontWeight: "800",
    letterSpacing: -2,
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
    backgroundColor: colors.soft,
    borderRadius: 12,
    padding: 16,
  },
  "driver-facts": {
    flexDirection: "row",
    gap: 18,
    flexWrap: "wrap",
    fontSize: 13,
    color: colors.muted,
  },
  "assignment-state": {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    fontSize: 14,
  },
  "team-icon": {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.lime,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 40,
    height: 40,
    borderWidth: 2,
    borderColor: colors.surface,
    borderRadius: 20,
    backgroundColor: "#e0e9d3",
    color: "#354e31",
    textAlign: "center",
    fontSize: 13,
    lineHeight: 36,
    fontWeight: "700",
    overflow: "hidden",
    flexShrink: 0,
  },
  rose: { backgroundColor: "#f2dcd1", color: "#6d4639" },
  blue: { backgroundColor: "#dce6ec", color: "#375262" },
  "text-link": {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    fontSize: 14,
    fontWeight: "600",
  },
  notice: {
    ...border,
    padding: 16,
    marginVertical: 16,
    borderRadius: 12,
    backgroundColor: colors.soft,
    color: colors.green,
    fontSize: 14,
  },
  attention: { backgroundColor: colors.amberBg, color: colors.amber },
  positive: { backgroundColor: colors.soft, color: colors.green },
  neutral: { backgroundColor: colors.sidebar, color: colors.muted },
  "empty-state": {
    paddingVertical: 35,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  "empty-symbol": {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.lime,
    fontSize: 24,
    lineHeight: 48,
    textAlign: "center",
    marginBottom: 12,
  },
  "status-badge": {
    alignSelf: "flex-start",
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 9,
    backgroundColor: colors.sidebar,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 19,
    fontWeight: "700",
  },
  "route-summary": { gap: 13, marginTop: 22, marginBottom: 17 },
  "ride-list": {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 18,
    marginTop: 20,
    marginBottom: 30,
  },
  "ride-card-top": {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
  },
  "ride-date": {
    ...border,
    width: 43,
    borderRadius: 8,
    overflow: "hidden",
    alignItems: "center",
    flexShrink: 0,
  },
  "ride-card-bottom": {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingVertical: 10,
    marginTop: "auto",
    minHeight: 64,
  },
  "ride-card-note": { paddingBottom: 12, fontSize: 12 },
  "week-navigation": {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    marginVertical: 20,
  },
  "week-strip": {
    flexDirection: "row",
    gap: 10,
    marginTop: 24,
    marginBottom: 30,
  },
  "week-day": {
    ...border,
    flex: 1,
    paddingVertical: 15,
    paddingHorizontal: 4,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: "center",
    gap: 4,
  },
  today: {
    backgroundColor: colors.green,
    borderColor: colors.green,
    color: "white",
  },
  "ride-time": { marginBottom: 20, fontSize: 13, color: colors.muted },
  "ride-current-driver": { fontSize: 14 },
  "ride-overview": {
    flexDirection: "row",
    gap: 0,
    marginTop: 24,
    marginBottom: 30,
    backgroundColor: colors.surface,
    ...border,
    borderRadius: 15,
    overflow: "hidden",
  },
  "feature-details": {
    backgroundColor: colors.soft,
    paddingVertical: 25,
    paddingHorizontal: 28,
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
    justifyContent: "center",
    gap: 16,
  },
  "feature-state": {
    fontFamily: "Manrope",
    color: colors.amber,
    fontSize: 36,
    lineHeight: 44,
    fontWeight: "700",
    letterSpacing: -1,
    marginVertical: 16,
  },
  "section-caption": { fontSize: 13, lineHeight: 20, color: colors.muted },
  "section-head": {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 15,
    marginBottom: 19,
  },
  number: {
    backgroundColor: colors.lime,
    borderRadius: 6,
    fontSize: 12,
    lineHeight: 23,
    paddingHorizontal: 7,
  },
  "task-icon": {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: colors.amberBg,
    color: colors.amber,
    flexShrink: 0,
  },
  "journey-list": {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 18,
    marginVertical: 16,
  },
  "activity-list": { gap: 0, marginVertical: 16 },
  "form-section": { gap: 15 },
  "form-pair": { flexDirection: "row", gap: 15 },
  "ride-plan": { width: "100%", maxWidth: 900, alignSelf: "center" },
  candidate: {
    padding: 16,
    ...border,
    borderColor: colors.outline,
    borderRadius: 12,
    marginBottom: 20,
    gap: 8,
  },
  "invitation-link": { gap: 12 },
  "ride-next-action": { marginTop: 12, marginBottom: 4 },
  "page-footer": {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    marginTop: 40,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingVertical: 25,
  },
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
      { ...styles.panel, marginVertical: 0, padding: 20 },
      columns ? styles.gridChild : { width: "100%" },
    );
  if (parent.includes("ride-overview"))
    Object.assign(result, {
      flex: columns ? 1 : undefined,
      width: columns ? undefined : "100%",
      borderWidth: 0,
      borderRadius: 0,
      marginVertical: 0,
      padding: mobile ? 20 : 28,
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
      gap: 8,
      alignItems: "flex-start",
    });
  if (
    parent === "ride-card-top" &&
    !names.includes("ride-date") &&
    !names.includes("status-badge")
  )
    Object.assign(result, { flex: 1, minWidth: 120 });
  if (parent === "task-list")
    Object.assign(result, {
      ...styles.panel,
      flexDirection: "row",
      alignItems: "center",
      gap: 15,
      flexWrap: "wrap",
      padding: mobile ? 16 : 20,
      marginTop: 10,
      marginBottom: 0,
    });
  if (parent === "activity-list")
    Object.assign(result, {
      borderLeftWidth: 2,
      borderLeftColor: colors.lime,
      paddingLeft: 16,
    });
  if (parent.includes("week-day") && parent.includes("today"))
    result.color = "white";
  if (mobile) {
    if (names === "page-heading")
      Object.assign(result, {
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 12,
        marginBottom: 23,
      });
    if (names === "week-strip") result.gap = 4;
    if (names.includes("week-day"))
      Object.assign(result, {
        paddingVertical: 10,
        paddingHorizontal: 1,
        borderRadius: 8,
      });
  }
  return result;
}
