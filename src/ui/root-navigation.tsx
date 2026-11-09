import { Stack } from "expo-router";
import { colors } from "./styles";
export function RootNavigation() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
        animation: "none",
      }}
    />
  );
}
