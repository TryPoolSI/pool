import React, {
  Children,
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  useWindowDimensions,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { router, usePathname } from "expo-router";
import { colors, styles, classStyle, textRules } from "./styles";
import type { CommandInput } from "@/services/fields";
import { SelectControl } from "./select-control";
import { DateControl } from "./date-control";
import { keyboardInputProps, submitOnReturn } from "./keyboard-input";
import { followAnchor } from "./platform";
// Only presentation props cross this boundary; all rendered controls are native primitives.
export type ElementProps = {
  children?: ReactNode;
  dateTime?: string;
  className?: string;
  role?: string;
  id?: string;
  tabIndex?: number;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-hidden"?: string | boolean;
  "aria-live"?: string;
  "aria-atomic"?: string;
  "aria-current"?: string;
  style?: StyleProp<ViewStyle & TextStyle>;
  onPress?: () => void;
  onClick?: () => void;
};
export const TypographyScale = createContext<"app" | "auth">("app");
const Parent = createContext("");
const InheritedText = createContext<TextStyle>({});
const LabelText = createContext("");
const LabelToggle = createContext<((next: (() => void) | null) => void) | null>(
  null,
);
const Disabled = createContext(false);
export function textContent(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : React.isValidElement<{ children?: ReactNode }>(child)
          ? textContent(child.props.children)
          : "",
    )
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
function safeChildren(children: ReactNode) {
  const output: ReactNode[] = [];
  let text = "";
  function flush() {
    if (text) {
      output.push(
        <Text key={`text-${output.length}`} style={styles.text}>
          {text}
        </Text>,
      );
      text = "";
    }
  }
  for (const child of Children.toArray(children)) {
    if (typeof child === "string" || typeof child === "number")
      text += String(child);
    else {
      flush();
      output.push(child);
    }
  }
  flush();
  return output;
}

export function Box({
  children,
  className = "",
  style,
  ...props
}: ElementProps) {
  const { width } = useWindowDimensions(),
    parent = useContext(Parent),
    inherited = useContext(InheritedText);
  const rule = classStyle(className, width, parent);
  return (
    <Parent.Provider value={className}>
      <InheritedText.Provider value={{ ...inherited, ...textRules(rule) }}>
        <View
          testID={className.split(" ")[0] || undefined}
          nativeID={props.id}
          role={props.role as never}
          accessibilityLabel={props["aria-label"]}
          accessibilityElementsHidden={Boolean(props["aria-hidden"])}
          style={[styles.box, rule, style]}
        >
          {safeChildren(children)}
        </View>
      </InheritedText.Provider>
    </Parent.Provider>
  );
}
function useStyledText(props: ElementProps, base?: TextStyle, role?: string) {
  const scale = useContext(TypographyScale);
  const { width } = useWindowDimensions(),
    parent = useContext(Parent),
    inherited = useContext(InheritedText);
  const rule = classStyle(props.className, width, parent);
  const resolved = StyleSheet.flatten([
    styles.text,
    inherited,
    base,
    base === styles.h1
      ? scale === "auth"
        ? {
            fontSize: width <= 650 ? 27 : 29,
            lineHeight: 37,
            letterSpacing: -0.8,
          }
        : width <= 1200
          ? {
              fontSize: width <= 650 ? 28 : 30,
              lineHeight: width <= 650 ? 36 : 39,
              letterSpacing: -0.9,
            }
          : undefined
      : undefined,
    parent.includes("week-day")
      ? {
          fontSize:
            base === styles.strong
              ? width <= 650
                ? 21
                : 25
              : width <= 650
                ? 11
                : 12,
          textAlign: "center",
        }
      : undefined,
    rule,
    parent === "form-section"
      ? base === styles.h2
        ? { fontSize: 20, marginBottom: 5 }
        : base === styles.paragraph
          ? { fontSize: 13, marginVertical: 0 }
          : undefined
      : undefined,
    props.role === "alert" ? styles.alert : undefined,
    props.role === "status" ? styles.status : undefined,
    props.style,
  ]);
  return (
    <InheritedText.Provider value={textRules(resolved ?? {})}>
      <Text
        nativeID={props.id}
        role={(props.role ?? role) as never}
        aria-level={
          role === "heading"
            ? base === styles.h1
              ? 1
              : base === styles.h2
                ? 2
                : 3
            : undefined
        }
        accessibilityLabel={props["aria-label"]}
        aria-hidden={props["aria-hidden"] as boolean | undefined}
        aria-live={
          props.role === "alert"
            ? "assertive"
            : props.role === "status"
              ? "polite"
              : (props["aria-live"] as never)
        }
        selectable
        style={resolved}
      >
        {props.children}
      </Text>
    </InheritedText.Provider>
  );
}
export function Paragraph(p: ElementProps) {
  return useStyledText(p, styles.paragraph);
}
export function Inline(p: ElementProps) {
  return useStyledText(p);
}
export function Strong(p: ElementProps) {
  return useStyledText(p, styles.strong);
}
export function Small(p: ElementProps) {
  return useStyledText(p, styles.small);
}
export function Heading1(p: ElementProps) {
  return useStyledText(p, styles.h1, "heading");
}
export function Heading2(p: ElementProps) {
  return useStyledText(p, styles.h2, "heading");
}
export function Heading3(p: ElementProps) {
  return useStyledText(p, styles.h3, "heading");
}
export function Section(p: ElementProps) {
  return <Box {...p} className={`panel ${p.className ?? ""}`} />;
}
export function Article(p: ElementProps) {
  return <Box {...p} role="article" />;
}
export const Header = Box,
  Footer = Box,
  Main = Box,
  Aside = Box;
export function Nav(p: ElementProps) {
  return <Box {...p} role="navigation" style={[styles.nav, p.style]} />;
}
export function List(p: ElementProps) {
  return <Box {...p} role="list" style={[styles.list, p.style]} />;
}
export function ListItem(p: ElementProps) {
  return <Box {...p} role="listitem" style={[styles.li, p.style]} />;
}
export function Legend(p: ElementProps) {
  return <Strong {...p} style={[styles.small, p.style]} />;
}
export function Break() {
  return <Text>{"\n"}</Text>;
}
export function Anchor({ href = "", ...p }: ElementProps & { href?: string }) {
  const pathname = usePathname();
  return (
    <Text
      role="link"
      style={[styles.text, styles.link, p.style]}
      onPress={() => {
        if (href.startsWith("#")) followAnchor(href.slice(1));
        else router.push((href || pathname) as never);
      }}
    >
      {p.children}
    </Text>
  );
}
type Entry = {
  name: string;
  value: string;
  checked?: boolean;
  required?: boolean;
  type?: string;
  label: string;
};
type FormContext = {
  register: (id: string, entry: Entry) => void;
  remove: (id: string) => void;
  submit: () => void;
  disabled: boolean;
};
const FormState = createContext<FormContext | null>(null);
export function Form({
  children,
  onValues,
  disabled = false,
  ...p
}: ElementProps & {
  onValues?: (values: CommandInput) => void;
  disabled?: boolean;
}) {
  const parent = useContext(Parent);
  const { width } = useWindowDimensions();
  const entries = useRef(new Map<string, Entry>());
  const [error, setError] = useState("");
  function submit() {
    if (disabled) return;
    const values: CommandInput = {};
    for (const entry of entries.current.values()) {
      if (
        entry.required &&
        ((entry.type === "checkbox" && !entry.checked) || !entry.value.trim())
      ) {
        setError(`Complete ${entry.label || entry.name}.`);
        return;
      }
      if (entry.type === "checkbox" && !entry.checked) continue;
      const existing = values[entry.name];
      values[entry.name] =
        existing === undefined
          ? entry.value
          : Array.isArray(existing)
            ? [...existing, entry.value]
            : [existing, entry.value];
    }
    setError("");
    if (onValues) onValues(values);
    else
      router.push(
        `/app/schedule?${new URLSearchParams(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Array.isArray(v) ? v[0] : (v ?? "")])))}` as never,
      );
  }
  const context: FormContext = {
    register: (id, entry) => entries.current.set(id, entry),
    remove: (id) => {
      entries.current.delete(id);
    },
    submit,
    disabled,
  };
  return (
    <FormState.Provider value={context}>
      <Disabled.Provider value={disabled}>
        <Box
          {...p}
          role="form"
          aria-label={p["aria-label"] ?? "Pool form"}
          style={[
            styles.form,
            parent === "ride-plan"
              ? {
                  ...styles.panel,
                  maxWidth: "100%",
                  width: "100%",
                  padding: width <= 650 ? 18 : 25,
                  marginVertical: 20,
                  marginTop: 0,
                }
              : undefined,
            p.style,
          ]}
        >
          {children}
          {error && <Paragraph role="alert">{error}</Paragraph>}
        </Box>
      </Disabled.Provider>
    </FormState.Provider>
  );
}
export function Fieldset({
  disabled = false,
  ...p
}: ElementProps & { disabled?: boolean }) {
  const parent = useContext(Disabled);
  return (
    <Disabled.Provider value={parent || disabled}>
      <Box {...p} style={[styles.fieldset, p.style]}>
        {Children.map(p.children, (child, index) =>
          index > 0 &&
          React.isValidElement<ElementProps>(child) &&
          child.props.className === "form-section"
            ? React.cloneElement(child, {
                style: [
                  {
                    borderTopWidth: 1,
                    borderColor: colors.line,
                    paddingTop: 25,
                  },
                  child.props.style,
                ],
              })
            : child,
        )}
      </Box>
    </Disabled.Provider>
  );
}
export function Label({ children, className, ...p }: ElementProps) {
  const toggle = useRef<(() => void) | null>(null);
  const nodes = Children.toArray(children);
  const controls = nodes.filter((child) => React.isValidElement(child));
  const label = textContent(
    nodes.filter((child) => !React.isValidElement(child)),
  );
  const checkbox = className === "checkbox-label";
  const content = (
    <>
      {checkbox ? controls : null}
      <Text
        style={[
          styles.text,
          checkbox
            ? { flex: 1, fontSize: 14, fontWeight: "400" }
            : styles.labelText,
        ]}
      >
        {label}
      </Text>
      {checkbox ? null : controls}
    </>
  );
  return (
    <LabelText.Provider value={label}>
      <LabelToggle.Provider
        value={(next) => {
          toggle.current = next;
        }}
      >
        {checkbox ? (
          <Pressable
            accessible={false}
            focusable={false}
            tabIndex={-1}
            onPress={() => toggle.current?.()}
            style={styles.checkboxLabel}
          >
            {content}
          </Pressable>
        ) : (
          <Box {...p} className={className} style={styles.label}>
            {content}
          </Box>
        )}
      </LabelToggle.Provider>
    </LabelText.Provider>
  );
}
type FieldProps = ElementProps & {
  name?: string;
  type?: string;
  value?: string | number;
  defaultValue?: string | number;
  defaultChecked?: boolean;
  required?: boolean;
  readOnly?: boolean;
  autoComplete?: string;
  maxLength?: number;
  minLength?: number;
  min?: number;
  max?: string | number;
  step?: string | number;
  placeholder?: string;
  onChange?: (event: { target: { value: string } }) => void;
  onFocus?: (event: never) => void;
};
export function Field({
  name = "",
  type = "text",
  value: controlled,
  defaultValue = "",
  defaultChecked = false,
  onChange,
  ...p
}: FieldProps) {
  const id = useId(),
    form = useContext(FormState),
    label = useContext(LabelText) || p["aria-label"] || name,
    disabled = useContext(Disabled) || form?.disabled;
  const toggle = useContext(LabelToggle);
  const [draft, setDraft] = useState(String(defaultValue));
  const [checked, setChecked] = useState(defaultChecked);
  useEffect(() => {
    if (type === "checkbox" && toggle) {
      toggle(() => setChecked((previous) => !previous));
      return () => {
        toggle(null);
      };
    }
  }, [type, toggle]);
  const value = controlled === undefined ? draft : String(controlled);
  const entryValue = type === "checkbox" ? String(controlled ?? "on") : value;
  useEffect(() => {
    form?.register(id, {
      name,
      value: entryValue,
      checked: type === "checkbox" ? checked : undefined,
      required: p.required,
      type,
      label,
    });
    return () => form?.remove(id);
  }, [form, id, name, entryValue, checked, p.required, type, label]);
  const change = (next: string) => {
    setDraft(next);
    onChange?.({ target: { value: next } });
  };
  if (type === "hidden") return null;
  if (type === "checkbox")
    return (
      <Pressable
        testID={name ? `field-${name}-${entryValue}` : undefined}
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        aria-checked={checked}
        aria-disabled={Boolean(disabled)}
        accessibilityState={{ checked, disabled: Boolean(disabled) }}
        disabled={disabled}
        onPress={(event) => {
          event.stopPropagation();
          setChecked(!checked);
        }}
        style={[
          styles.checkbox,
          checked
            ? { backgroundColor: colors.green, borderColor: colors.green }
            : undefined,
          disabled ? styles.disabled : undefined,
        ]}
      >
        <Text style={{ color: "white", fontSize: 16 }}>
          {checked ? "✓" : ""}
        </Text>
      </Pressable>
    );
  if (type === "date" || type === "datetime-local")
    return (
      <DateControl
        testID={name ? `field-${name}` : undefined}
        label={label}
        type={type}
        value={value}
        onChange={change}
        disabled={Boolean(disabled)}
      />
    );
  return (
    <TextInput
      {...keyboardInputProps}
      testID={name ? `field-${name}` : undefined}
      nativeID={p.id}
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      value={value}
      onChangeText={change}
      editable={!p.readOnly && !disabled}
      secureTextEntry={type === "password"}
      autoCapitalize={
        type === "email" || type === "password" ? "none" : "sentences"
      }
      autoCorrect={type !== "email" && type !== "password"}
      keyboardType={
        type === "email"
          ? "email-address"
          : type === "number"
            ? "numeric"
            : "default"
      }
      autoComplete={p.autoComplete as never}
      maxLength={p.maxLength}
      placeholder={p.placeholder}
      placeholderTextColor={colors.muted}
      onSubmitEditing={submitOnReturn ? () => form?.submit() : undefined}
      style={[styles.field, disabled ? styles.disabled : undefined]}
    />
  );
}
export function Option(
  _p: ElementProps & { value?: string; disabled?: boolean },
) {
  return null;
}
export function Select({
  name = "",
  defaultValue = "",
  value: controlled,
  required,
  onChange,
  children,
  ...p
}: FieldProps) {
  const id = useId(),
    form = useContext(FormState),
    label = useContext(LabelText) || name,
    disabled = useContext(Disabled) || form?.disabled;
  const [draft, setDraft] = useState(String(defaultValue));
  const options = Children.toArray(children)
    .filter(React.isValidElement)
    .map((node) => {
      const item = node as React.ReactElement<{
        value: string;
        children: ReactNode;
        disabled?: boolean;
      }>;
      return {
        value: item.props.value,
        label: textContent(item.props.children),
        disabled: item.props.disabled,
      };
    });
  const value = controlled === undefined ? draft : String(controlled);
  const selected =
    controlled === undefined && !draft && options[0]?.value
      ? options[0].value
      : value;
  useEffect(() => {
    form?.register(id, {
      name,
      value: selected,
      required,
      type: "select",
      label,
    });
    return () => form?.remove(id);
  }, [form, id, name, selected, required, label]);
  return (
    <SelectControl
      testID={name ? `field-${name}` : undefined}
      label={label}
      value={value}
      options={options}
      disabled={Boolean(disabled)}
      onChange={(next) => {
        setDraft(next);
        onChange?.({ target: { value: next } });
      }}
    />
  );
}
export function Button({
  children,
  type = "button",
  disabled = false,
  onPress,
  onClick,
  ...p
}: ElementProps & { type?: string; disabled?: boolean; autoFocus?: boolean }) {
  const form = useContext(FormState),
    parent = useContext(Disabled);
  const primary = type === "submit" || p.className?.includes("primary");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={p["aria-label"]}
      disabled={disabled || parent}
      aria-disabled={disabled || parent}
      accessibilityState={{ disabled: disabled || parent }}
      onPress={() => {
        if (onPress) onPress();
        else if (onClick) onClick();
        else if (type === "submit") form?.submit();
      }}
      style={[
        styles.button,
        primary ? styles.primary : undefined,
        disabled || parent ? styles.disabled : undefined,
        p.style,
      ]}
    >
      <Text
        style={[
          styles.text,
          styles.buttonText,
          primary ? styles.primaryText : undefined,
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}
