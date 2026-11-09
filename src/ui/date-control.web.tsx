import type { DateProps } from "./date-control";
import { colors } from "./styles";
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
      step={1}
      onChange={(e) => onChange(e.target.value)}
      style={{
        font: '16px "DM Sans", sans-serif',
        color: colors.ink,
        background: colors.surface,
        minHeight: 46,
        border: `1px solid ${colors.outline}`,
        borderRadius: 8,
        padding: "11px 12px",
        boxSizing: "border-box",
        width: "100%",
        minWidth: 0,
      }}
    />
  );
}
