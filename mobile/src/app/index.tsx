import { ScrollView, View, Text, useWindowDimensions } from "react-native";
import { Brand } from "@/features/app/presentation";
import Link from "@/ui/link";
import { colors, styles } from "@/ui/styles";
export default function Landing() {
  const { width } = useWindowDimensions();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{ padding: 24, paddingTop: 48 }}
    >
      <View style={{ maxWidth: 1100, width: "100%", alignSelf: "center" }}>
        <Brand />
        <View
          style={[
            styles.panel,
            { padding: width < 650 ? 28 : 72, marginTop: 70 },
          ]}
        >
          <Text
            style={[
              styles.text,
              { fontSize: 12, fontWeight: "700", letterSpacing: 1.1 },
            ]}
          >
            SHARE THE DRIVING
          </Text>
          <Text
            role="heading"
            aria-level={1}
            style={[
              styles.text,
              styles.h1,
              {
                fontSize: width < 650 ? 36 : 56,
                lineHeight: width < 650 ? 44 : 68,
                maxWidth: 600,
                marginVertical: 20,
              },
            ]}
          >
            A smoother ride for every family.
          </Text>
          <Text style={[styles.text, { color: colors.muted, maxWidth: 540 }]}>
            Coordinate rides with your circle, agree on a driver and confirm
            every child’s handoff — together.
          </Text>
          <View
            style={{
              flexDirection: "row",
              gap: 12,
              flexWrap: "wrap",
              marginTop: 30,
            }}
          >
            <Link className="button primary" href="/sign-up">
              Create an adult account
            </Link>
            <Link className="button secondary" href="/sign-in">
              Sign in
            </Link>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
