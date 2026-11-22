import type { SelectProps } from "./select-control";
import { colors, fieldHeight, radius, spacing } from "./styles";
// Browser select preserves keyboard, form semantics and accessible option selection.
export function SelectControl({
  label,
  value,
  options,
  disabled,
  onChange,
}: SelectProps) {
  return (
    <select
      aria-label={label}
      value={value || options[0]?.value || ""}
      disabled={disabled}
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
        appearance: "none",
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2355657F' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: `right ${spacing.lg}px center`,
        paddingRight: 44,
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
