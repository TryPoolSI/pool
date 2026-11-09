// Browser font-display:swap paints immediately while the shared faces load.
import "./global.css";
export function useAppFonts(): [boolean, Error | null] {
  return [true, null];
}
