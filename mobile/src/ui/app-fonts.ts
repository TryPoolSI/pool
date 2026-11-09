import { useFonts } from "expo-font";
export function useAppFonts() {
  return useFonts({
    "DM Sans": require("../../public/fonts/dm-sans.ttf"),
    Manrope: require("../../public/fonts/manrope.ttf"),
  });
}
