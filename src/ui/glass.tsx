import { Platform, View, type ViewProps } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { colors, shadow } from "./styles";

// Liquid Glass belongs to the navigation layer only: the phone tab bar, the top
// bar, toasts and floating actions. Content surfaces stay opaque (DESIGN.md).
let liquid = false;
try {
  liquid = Platform.OS === "ios" && isLiquidGlassAvailable();
} catch {
  liquid = false;
}

const fallback = Platform.select({
  // Browsers get the same reading through a backdrop blur.
  web: {
    backgroundColor: colors.glass,
    backdropFilter: "saturate(180%) blur(22px)",
    WebkitBackdropFilter: "saturate(180%) blur(22px)",
    borderWidth: 1,
    borderColor: colors.glassLine,
    boxShadow: shadow.float,
  },
  // Older iOS and Android: a near-opaque surface keeps text legible.
  default: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: colors.line,
    boxShadow: shadow.float,
  },
}) as ViewProps["style"];

export function Glass({
  style,
  tint,
  interactive = false,
  children,
  ...rest
}: ViewProps & { tint?: string; interactive?: boolean }) {
  if (liquid)
    return (
      <GlassView
        {...rest}
        glassEffectStyle="regular"
        colorScheme="light"
        tintColor={tint}
        isInteractive={interactive}
        style={style}
      >
        {children}
      </GlassView>
    );
  return (
    <View
      {...rest}
      style={[fallback, tint ? { backgroundColor: tint } : undefined, style]}
    >
      {children}
    </View>
  );
}
