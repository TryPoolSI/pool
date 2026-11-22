import type { DateProps } from "./date-control";
import { colors, fieldHeight, radius, spacing } from "./styles";
export function DateControl({
  label,
  type,
  value,
  disabled,
  onChange,
}: DateProps) {
  return (
    <input
      aria-label={label}
      type={type}
      value={value}
      disabled={disabled}
      step={type === "time" ? 60 : 1}
      onChange={(e) => onChange(e.target.value)}
      style={{
        font: '16px "DM Sans", sans-serif',
        color: colors.ink,
        background: colors.surface,
        minHeight: fieldHeight,
        border: `1px solid ${colors.outline}`,
        borderRadius: radius.md,
        padding: `${spacing.md}px ${spacing.lg}px`,
        boxSizing: "border-box",
        width: "100%",
        minWidth: 0,
      }}
    />
  );
}
