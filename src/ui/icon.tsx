import Svg, { Path } from "react-native-svg";
import { colors } from "./styles";

const paths = {
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
  plus: "M12 5v14M5 12h14",
  "arrow-left": "m12 5-7 7 7 7M5 12h14",
  "arrow-right": "m12 5 7 7-7 7M19 12H5",
  "chevron-left": "m15 6-6 6 6 6",
  "chevron-right": "m9 6 6 6-6 6",
  "chevron-up": "m6 15 6-6 6 6",
  "chevron-down": "m6 9 6 6 6-6",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "m6 6 12 12M18 6 6 18",
  info: "M12 11v6m0-10h.01M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0",
};
export function Icon({
  name,
  size = 20,
  color = colors.ink,
}: {
  name: keyof typeof paths;
  size?: number;
  color?: string;
}) {
  return (
    <Svg
      aria-hidden={true}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      style={{ flexShrink: 0 }}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d={paths[name]} />
    </Svg>
  );
}
