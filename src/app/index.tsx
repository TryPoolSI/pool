import { Image, ScrollView, View, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import logoMark from "@/assets/logo-mark.png";
import Link from "@/ui/link";
import { colors, fonts, spacing, styles } from "@/ui/styles";

// The signed-out front door: the logo, the promise, two ways in.
export default function Landing() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        padding: spacing.xxl,
        paddingTop: Math.max(spacing.xxxl, insets.top),
        paddingBottom: Math.max(spacing.xxxl, insets.bottom),
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 440,
          alignSelf: "center",
          alignItems: "center",
          gap: spacing.lg,
        }}
      >
        <Image
          source={logoMark}
          accessibilityIgnoresInvertColors
          aria-hidden={true}
          style={{ width: 128, height: 128 }}
        />
        <Text
          style={[
            styles.text,
            {
              fontFamily: fonts.display,
              fontSize: 40,
              lineHeight: 46,
              fontWeight: "800",
              letterSpacing: -1.6,
            },
          ]}
        >
          pool.
        </Text>
        <Text
          role="heading"
          aria-level={1}
          style={[styles.text, styles.h1, { textAlign: "center", marginBottom: 0 }]}
        >
          Share the driving
        </Text>
        <Text
          style={[
            styles.text,
            { color: colors.muted, textAlign: "center", maxWidth: 360 },
          ]}
        >
          Plan school and activity rides with families you trust. See who’s
          driving each one, and know when your child has been handed off.
        </Text>
        <View
          style={{
            alignSelf: "stretch",
            gap: spacing.md,
            marginTop: spacing.lg,
          }}
        >
          <Link
            className="button primary"
            href="/sign-up"
            style={{ alignSelf: "stretch" }}
          >
            Create an adult account
          </Link>
          <Link
            className="button secondary"
            href="/sign-in"
            style={{ alignSelf: "stretch" }}
          >
            Sign in
          </Link>
        </View>
      </View>
    </ScrollView>
  );
}
