import type { SelectProps } from "./select-control";
import { colors } from "./styles";
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
        minHeight: 46,
        border: `1px solid ${colors.outline}`,
        borderRadius: 8,
        padding: "11px 12px",
        width: "100%",
        minWidth: 0,
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
